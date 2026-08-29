'use client'

import { getInitials } from '@/lib/helpers'

interface StudentAvatarProps {
  firstName: string
  lastName: string
  photoUrl?: string | null
  size?: number
  className?: string
  style?: React.CSSProperties
}

export default function StudentAvatar({ firstName, lastName, photoUrl, size = 48, className = '', style }: StudentAvatarProps) {
  const initials = getInitials(`${firstName} ${lastName}`)
  const fontSize = Math.max(10, size * 0.3)

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${firstName} ${lastName}`}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size, ...style }}
      />
    )
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize, ...style }}
    >
      {initials}
    </div>
  )
}
