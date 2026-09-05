/**
 * Gaps in lib.dom for the File System Access API surface we use.
 * Chromium-only; every use is feature-checked at runtime.
 */

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: string
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface FileSystemObserverRecord {
  root: FileSystemHandle
  changedHandle: FileSystemHandle
  relativePathComponents: string[]
  type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored'
}

declare class FileSystemObserver {
  constructor(callback: (records: FileSystemObserverRecord[], observer: FileSystemObserver) => void)
  observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>
  unobserve(handle: FileSystemHandle): void
  disconnect(): void
}
