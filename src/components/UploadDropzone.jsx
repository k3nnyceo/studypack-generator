import { CloudUpload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clearPendingUpload, markPendingUpload } from '../lib/pendingUpload.js'

const FORMATS = [
  { label: 'PDF', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { label: 'PPTX', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { label: 'Photos & scans', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { label: 'Study guide JSON', className: 'bg-brand-50 text-brand-700 ring-brand-200' },
]

export default function UploadDropzone({ onFile, disabled }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  // Closing the picker without choosing a file isn't an interrupted upload.
  useEffect(() => {
    const input = inputRef.current
    input?.addEventListener('cancel', clearPendingUpload)
    return () => input?.removeEventListener('cancel', clearPendingUpload)
  }, [])

  function openPicker() {
    if (disabled) return
    markPendingUpload('picking')
    inputRef.current?.click()
  }

  // Several files only make sense as photos of pages; App sorts that out.
  function handleFiles(files) {
    if (disabled || !files?.length) return
    onFile(files.length === 1 ? files[0] : [...files])
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      aria-label="Upload lecture notes or a study guide"
      onClick={openPicker}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault()
          openPicker()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-3xl bg-white p-2 shadow-elevated ring-1 transition duration-300 ${
        isDragging ? 'scale-[1.01] ring-2 ring-brand-500' : 'ring-stone-200 hover:ring-brand-300'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div
        className={`flex flex-col items-center justify-center rounded-[1.25rem] border-2 border-dashed px-6 py-12 text-center transition duration-300 sm:py-14 ${
          isDragging
            ? 'border-brand-400 bg-brand-50'
            : 'border-stone-200 bg-stone-50/60 group-hover:border-brand-300 group-hover:bg-brand-50/40'
        }`}
      >
        <span
          className={`flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand transition duration-300 ${
            isDragging ? '-translate-y-1 scale-110' : 'group-hover:-translate-y-0.5'
          }`}
        >
          <CloudUpload className="size-7" strokeWidth={2} aria-hidden />
        </span>
        <p className="mt-5 text-lg font-semibold text-stone-900">
          {isDragging ? 'Drop to upload' : 'Drag & drop your lecture notes'}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          or <span className="font-semibold text-brand-600 underline-offset-4 group-hover:underline">browse files</span>{' '}
          · up to 100 MB
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs font-semibold">
          {FORMATS.map((f) => (
            <span key={f.label} className={`rounded-full px-3 py-1 ring-1 ring-inset ${f.className}`}>
              {f.label}
            </span>
          ))}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.pptx,.json,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/json,image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        // The input sits inside the dropzone: stop its click bubbling back up
        // and opening the picker a second time.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          clearPendingUpload()
          handleFiles(e.target.files)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
    </div>
  )
}
