import { useRef, useState } from 'react'

export default function UploadDropzone({ onFile, disabled }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleFiles(files) {
    if (disabled || !files?.length) return
    onFile(files[0])
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault()
          inputRef.current?.click()
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
      className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 ${
        isDragging
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/40'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 transition group-hover:scale-105">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-slate-800">
        {isDragging ? 'Drop it here' : 'Drag & drop your lecture notes'}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        or <span className="font-medium text-indigo-600 underline-offset-2 group-hover:underline">browse files</span>
      </p>
      <div className="mt-5 flex gap-2 text-xs font-medium">
        <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-rose-200">PDF</span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">PPTX</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">up to 50 MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
    </div>
  )
}
