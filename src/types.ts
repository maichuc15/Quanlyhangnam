export enum EventType {
  WEDDING = 'wedding',
  FUNERAL = 'funeral',
  DEATH_ANNIVERSARY = 'death_anniversary',
  CLAN_CEREMONY = 'clan_ceremony',
  FULL_MONTH = 'full_month',
  FIRST_BIRTHDAY = 'first_birthday',
  BIRTHDAY = 'birthday',
  FAMILY_EVENT = 'family_event',
  OTHER = 'other',
}

export enum EventPriority {
  IMPORTANT = 'important',
  NORMAL = 'normal',
  OPTIONAL = 'optional',
}

export enum AttendanceStatus {
  UNDECIDED = 'undecided',
  WILL_ATTEND = 'will_attend',
  NOT_ATTENDING = 'not_attending',
  ATTENDED = 'attended',
}

export enum PaymentSource {
  PERSONAL = 'personal',
  FAMILY_FUND = 'family_fund',
}

export enum FundTransactionType {
  CONTRIBUTION = 'contribution',
  EXPENSE = 'expense',
  INITIAL = 'initial',
}

export enum MemberRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum ReminderOffset {
  SEVEN_DAYS = 7,
  THREE_DAYS = 3,
  ONE_DAY = 1,
  SAME_DAY = 0,
}

export enum MainTab {
  DASHBOARD = 'dashboard',
  CALENDAR = 'calendar',
  FINANCE = 'finance',
  NOTES = 'notes',
  PROFILE = 'profile',
}

export enum NoteCategory {
  PREPARATION = 'preparation',
  SHOPPING = 'shopping',
  GIFT_REMINDER = 'gift_reminder',
  PERSONAL = 'personal',
}

export enum RightPanelMode {
  DETAIL = 'detail',
  QUICK_ADD = 'quick_add',
  EDIT_EVENT = 'edit_event',
  FUND_FORM = 'fund_form',
}

export enum TimeUrgency {
  TODAY = 'today',
  SOON_1_3 = 'soon_1_3',
  SOON_4_7 = 'soon_4_7',
  UPCOMING_8_30 = 'upcoming_8_30',
  LATER_30_PLUS = 'later_30_plus',
  PAST = 'past',
}

export interface FamilyMember {
  id: string;
  fullName: string;
  relation: string;
  phone?: string;
  role: MemberRole;
}

export interface FamilyGroup {
  id: string;
  name: string;
  description: string;
  annualBudget: number;
  members: FamilyMember[];
}

export interface FamilyEvent {
  id: string;
  familyId: string;
  title: string;
  eventType: EventType;
  relatedPerson: string;
  /** Stored as YYYY-MM-DD (solar date in Asia/Ho_Chi_Minh) */
  eventDate: string;
  /** Optional HH:mm */
  eventTime: string;
  location: string;
  priority: EventPriority;
  note: string;
  attendance: AttendanceStatus;
  /** Expected gift/contribution amount in VND */
  expectedAmount: number;
  /** Confirmed actual amount spent in VND */
  actualAmount: number;
  /** Only counts toward actual spent once confirmed */
  expenseConfirmed: boolean;
  paymentSource: PaymentSource;
  expenseDate?: string;
  /** Repeat annually (e.g., death anniversary by lunar date) */
  repeatYearly: boolean;
  repeatByLunar: boolean;
  /** Enabled reminder offsets in days */
  reminders: ReminderOffset[];
  createdAt: string;
}

export interface FundTransaction {
  id: string;
  familyId: string;
  type: FundTransactionType;
  amount: number;
  /** Optional link to event to prevent double counting */
  eventId?: string;
  actorName: string;
  transactionDate: string;
  note: string;
}

export interface PersonalNote {
  id: string;
  familyId: string;
  title: string;
  content: string;
  category: NoteCategory;
  linkedEventId?: string;
  pinned: boolean;
  updatedAt: string;
}

export interface ReminderSettings {
  enabled: boolean;
  browserNotifications: boolean;
  defaultOffsets: ReminderOffset[];
}

export interface FinancialSummary {
  annualBudget: number;
  totalExpected: number;
  totalActualPersonal: number;
  totalActualFromFund: number;
  totalActualAll: number;
  confirmedExpenseCount: number;
  remainingBudget: number;
  fundTotalIn: number;
  fundTotalOut: number;
  fundBalance: number;
}

export interface ReminderAlert {
  id: string;
  event: FamilyEvent;
  daysUntil: number;
  milestoneLabel: string;
  headline: string;
  detailLine: string;
  isOverdueUnconfirmed: boolean;
}

export interface AppState {
  activeFamilyId: string;
  selectedYear: number;
  selectedMonth: number; // 1-12
  activeTab: MainTab;
  rightPanelMode: RightPanelMode;
  selectedEventId: string | null;
  dashboardRange: '30d' | 'year' | 'unconfirmed';
  calendarMode: 'month' | 'year';
  financeSubTab: 'expenses' | 'fund';
  searchQuery: string;
  filterEventType: EventType | 'all';
  families: FamilyGroup[];
  events: FamilyEvent[];
  fundTransactions: FundTransaction[];
  personalNotes: PersonalNote[];
  reminderSettings: ReminderSettings;
}
