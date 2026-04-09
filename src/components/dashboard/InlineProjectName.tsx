'use client'

import { useRef, useState } from 'react'
import { updateProject } from '@/lib/services/project-service'

type InlineProjectNameProps = {
  projectId: string
  initialName: string
  className?: string
}

export function InlineProjectName({
  projectId,
  initialName,
  className = '',
}: InlineProjectNameProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEditing() {
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === initialName) {
      setName(initialName)
      setEditing(false)
      return
    }
    setEditing(false)
    await updateProject(projectId, { name: trimmed })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') {
      setName(initialName)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className={`rounded-md border border-gray-300 bg-white px-1.5 py-0.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="Click to rename"
      className={`cursor-text rounded-md px-1.5 py-0.5 text-left transition hover:bg-gray-100 ${className}`}
    >
      {name}
    </button>
  )
}
