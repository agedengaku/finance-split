import 'express-session'

export interface HouseholdMembership {
  householdId: number
  role: 'owner' | 'member'
  name: string
  currency: 'JPY'
}

declare module 'express-session' {
  interface SessionData {
    userId?: number
  }
}
declare global {
  namespace Express {
    interface Request {
      membership: HouseholdMembership
    }
  }
}
