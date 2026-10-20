// Departments for the Pack library, from the letters of a pack's course code
// ("CHM 101 General Chemistry I" -> Chemistry). Codes that aren't listed keep
// their letters as the name; courses without a code go under "Other courses".

const DEPARTMENTS = {
  BCH: 'Biochemistry',
  BIO: 'Biology',
  CHE: 'Chemical Engineering',
  CHM: 'Chemistry',
  CIV: 'Civil Engineering',
  CPE: 'Computer Engineering',
  CSC: 'Computer Science',
  CVE: 'Civil Engineering',
  ECO: 'Economics',
  EEE: 'Electrical & Electronic Engineering',
  ELE: 'Electrical & Electronic Engineering',
  ENG: 'English',
  ENT: 'Entrepreneurship',
  GET: 'General Engineering',
  GST: 'General Studies',
  MCE: 'Mechatronics Engineering',
  MCT: 'Mechatronics Engineering',
  MEC: 'Mechanical Engineering',
  MECH: 'Mechanical Engineering',
  MEE: 'Mechanical Engineering',
  MTH: 'Mathematics',
  PHY: 'Physics',
  STA: 'Statistics',
}

export const OTHER_COURSES = 'Other courses'

// "CHM 101 …" / "MECH2201 …" -> "CHM" / "MECH"; null without a code.
export const courseCode = (course = '') => course.match(/^([A-Z]{2,4})\s?\d{3,4}\b/)?.[1] ?? null

export function departmentOf(course) {
  const code = courseCode(course)
  return code ? (DEPARTMENTS[code] ?? code) : OTHER_COURSES
}

// Packs grouped by department, departments A-Z ("Other courses" last), and
// within one by course (numbers in order: CHM 101, 102, 107…), verified first.
export function groupByDepartment(packs) {
  const groups = new Map()
  for (const pack of packs) {
    const department = departmentOf(pack.course)
    if (!groups.has(department)) groups.set(department, [])
    groups.get(department).push(pack)
  }
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  return [...groups.entries()]
    .map(([department, items]) => ({
      department,
      codes: [...new Set(items.map((p) => courseCode(p.course)).filter(Boolean))].sort(),
      items: [...items].sort(
        (a, b) => byName(a.course ?? '', b.course ?? '') || Number(b.verified) - Number(a.verified) || b.sharedAt - a.sharedAt,
      ),
    }))
    .sort((a, b) => {
      if (a.department === OTHER_COURSES) return 1
      if (b.department === OTHER_COURSES) return -1
      return byName(a.department, b.department)
    })
}
