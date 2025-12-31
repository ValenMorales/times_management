// Time parsing and formatting utilities

/**
 * Parse time in various formats to components
 * Supports: "9:30 AM", "10:49 p. m.", "13:45"
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number; period: 'AM' | 'PM' } {
  // Normalize Spanish format "p. m." / "a. m." to "PM" / "AM"
  const normalizedTime = timeStr
    .replace(/\s*a\.\s*m\.?\s*$/i, ' AM')
    .replace(/\s*p\.\s*m\.?\s*$/i, ' PM')
    .replace(/\s*a\.m\.?\s*$/i, ' AM')
    .replace(/\s*p\.m\.?\s*$/i, ' PM')
    .trim()
  
  // Try 12-hour format (e.g. "9:30 AM", "1:00 PM")
  const match12h = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (match12h) {
    return {
      hours: parseInt(match12h[1] || '12'),
      minutes: parseInt(match12h[2] || '0'),
      period: (match12h[3]?.toUpperCase() || 'AM') as 'AM' | 'PM'
    }
  }
  
  // Try 24-hour format (e.g. "13:45", "09:30")
  const match24h = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (match24h) {
    const hours24 = parseInt(match24h[1] || '0')
    const minutes = parseInt(match24h[2] || '0')
    const period: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
    return { hours: hours12, minutes, period }
  }
  
  // Default to 9:00 AM
  return { hours: 9, minutes: 0, period: 'AM' }
}

/**
 * Parse 24h time string to components
 */
export function parseTimeToComponents(time24: string): { hours: number; minutes: number; period: string } {
  const [h, m] = time24.split(':').map(Number)
  const hours24 = h ?? 0
  const mins = m ?? 0
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
  return { hours: hours12, minutes: mins, period }
}

/**
 * Convert 12h components to 24h time string
 */
export function componentsToTime24(hours: number, minutes: number, period: string): string {
  let hours24 = hours
  if (period === 'AM' && hours === 12) hours24 = 0
  else if (period === 'PM' && hours !== 12) hours24 = hours + 12
  return `${hours24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Format date as YYYY-MM-DD in local timezone
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Extract date from a DatePicker value safely
 * DatePickers often return dates at midnight UTC, which can shift to the previous day in local time
 * This function compensates for that by checking if the time is midnight UTC and using UTC methods
 */
export function datePickerToDateString(date: Date): string {
  // Check if the time is exactly midnight UTC (common for DatePicker values)
  const isUtcMidnight = date.getUTCHours() === 0 && 
                        date.getUTCMinutes() === 0 && 
                        date.getUTCSeconds() === 0 && 
                        date.getUTCMilliseconds() === 0
  
  if (isUtcMidnight) {
    // Use UTC methods to get the intended date
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  return formatDateLocal(date)
}

/**
 * Get the Monday of a given week
 */
export function getWeekStartDate(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return formatDateLocal(d)
}

/**
 * Get today's date string in local timezone
 */
export function getTodayDateString(): string {
  return formatDateLocal(new Date())
}

/**
 * Format minutes to hours and minutes string
 */
export function formatWorkedTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins.toString().padStart(2, '0')}m`
}

/**
 * Parse a date string (YYYY-MM-DD) safely for local timezone
 * Using T12:00:00 (noon) to avoid any timezone edge cases
 */
export function parseDateString(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00')
}

/**
 * Format date for display
 */
export function formatDateForDisplay(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }
  return parseDateString(dateStr).toLocaleDateString('es-ES', options || defaultOptions)
}

/**
 * Format timestamp to date string
 */
export function formatPaymentDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

