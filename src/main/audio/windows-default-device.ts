import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WindowsAudioDevice } from '../../shared/types'

const execFileAsync = promisify(execFile)

// Windows không có API công khai để đổi thiết bị phát mặc định — dùng COM interface
// IPolicyConfig (không tài liệu hoá nhưng ổn định từ Win7, chính AudioDeviceCmdlets/EarTrumpet
// cũng dùng). Gọi qua PowerShell + Add-Type để khỏi cần native module hay cài đặt thêm.
const CS_SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;

namespace LtcAudio {
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IntPtr ppInterface);
    [PreserveSig] int OpenPropertyStore(int stgmAccess, out IPropertyStore ppProperties);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    [PreserveSig] int GetState(out int pdwState);
  }

  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out int pcDevices);
    [PreserveSig] int Item(int nDevice, out IMMDevice ppDevice);
  }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PropertyKey {
    public Guid fmtid;
    public int pid;
    public PropertyKey(Guid f, int p) { fmtid = f; pid = p; }
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct PropVariant {
    [FieldOffset(0)] public short vt;
    [FieldOffset(8)] public IntPtr pwszVal;
  }

  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    [PreserveSig] int GetCount(out int cProps);
    [PreserveSig] int GetAt(int iProp, out PropertyKey pkey);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant pv);
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumeratorCom { }

  [Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    [PreserveSig] int GetMixFormat(string pszDeviceName, IntPtr ppFormat);
    [PreserveSig] int GetDeviceFormat(string pszDeviceName, bool bDefault, IntPtr ppFormat);
    [PreserveSig] int ResetDeviceFormat(string pszDeviceName);
    [PreserveSig] int SetDeviceFormat(string pszDeviceName, IntPtr pEndpointFormat, IntPtr mixFormat);
    [PreserveSig] int GetProcessingPeriod(string pszDeviceName, bool bDefault, IntPtr pmftDefaultPeriod, IntPtr pmftMinimumPeriod);
    [PreserveSig] int SetProcessingPeriod(string pszDeviceName, IntPtr pmftPeriod);
    [PreserveSig] int GetShareMode(string pszDeviceName, IntPtr pMode);
    [PreserveSig] int SetShareMode(string pszDeviceName, IntPtr mode);
    [PreserveSig] int GetPropertyValue(string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
    [PreserveSig] int SetPropertyValue(string pszDeviceName, bool bFxStore, IntPtr key, IntPtr pv);
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
    [PreserveSig] int SetEndpointVisibility(string pszDeviceName, bool bVisible);
  }

  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
  public class PolicyConfigCom { }

  public static class Api {
    static PropertyKey FriendlyName = new PropertyKey(new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), 14);

    static void Check(int hr, string what) {
      if (hr != 0) throw new Exception(what + " HRESULT=0x" + hr.ToString("X8"));
    }

    static string GetName(IMMDevice dev) {
      IPropertyStore store;
      if (dev.OpenPropertyStore(0, out store) != 0) return null;
      PropVariant pv;
      if (store.GetValue(ref FriendlyName, out pv) != 0) return null;
      return pv.pwszVal == IntPtr.Zero ? null : Marshal.PtrToStringUni(pv.pwszVal);
    }

    static string Esc(string s) {
      return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    public static string List() {
      var en = (IMMDeviceEnumerator)(object)new MMDeviceEnumeratorCom();
      string defId = "";
      IMMDevice def;
      if (en.GetDefaultAudioEndpoint(0, 1, out def) == 0) def.GetId(out defId); // eRender, eMultimedia
      IMMDeviceCollection col;
      Check(en.EnumAudioEndpoints(0, 1, out col), "EnumAudioEndpoints"); // eRender, DEVICE_STATE_ACTIVE
      int n;
      Check(col.GetCount(out n), "GetCount");
      var sb = new System.Text.StringBuilder("[");
      for (int i = 0; i < n; i++) {
        IMMDevice d;
        if (col.Item(i, out d) != 0) continue;
        string id;
        if (d.GetId(out id) != 0) continue;
        string name = GetName(d);
        if (name == null) name = id;
        if (sb.Length > 1) sb.Append(",");
        sb.Append("{\"id\":\"").Append(Esc(id)).Append("\",\"name\":\"").Append(Esc(name))
          .Append("\",\"isDefault\":").Append(id == defId ? "true" : "false").Append("}");
      }
      return sb.Append("]").ToString();
    }

    public static void SetDefault(string id) {
      var pc = (IPolicyConfig)(object)new PolicyConfigCom();
      Check(pc.SetDefaultEndpoint(id, 0), "SetDefaultEndpoint(console)");
      Check(pc.SetDefaultEndpoint(id, 1), "SetDefaultEndpoint(multimedia)");
      Check(pc.SetDefaultEndpoint(id, 2), "SetDefaultEndpoint(communications)");
    }
  }
}
`

function buildScript(body: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    "Add-Type -TypeDefinition @'",
    CS_SOURCE,
    "'@",
    body,
    ''
  ].join('\r\n')
}

async function runPowerShell(body: string): Promise<string> {
  const encoded = Buffer.from(buildScript(body), 'utf16le').toString('base64')
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 }
  )
  return stdout.trim()
}

export async function listWindowsOutputDevices(): Promise<WindowsAudioDevice[]> {
  if (process.platform !== 'win32') return []
  const out = await runPowerShell('[Console]::Out.Write([LtcAudio.Api]::List())')
  return JSON.parse(out || '[]') as WindowsAudioDevice[]
}

export async function setWindowsDefaultOutputDevice(deviceId: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Chỉ hỗ trợ Windows')
  const escaped = deviceId.replace(/'/g, "''")
  await runPowerShell(`[LtcAudio.Api]::SetDefault('${escaped}')`)
}
