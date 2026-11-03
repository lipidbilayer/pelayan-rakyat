export interface CsvRow {
  [key: string]: string;
}

export interface ValidationError {
  line: number;
  personSlug?: string;
  message: string;
}

export interface ValidationWarning {
  line: number;
  personSlug?: string;
  message: string;
}

export interface ParsedSource {
  url: string;
  normalizedUrl: string;
  publisher: string;
  publishedAt: string;
  kind: "official" | "media" | "reference" | "social";
  isSpecific: boolean;
}

export interface ParsedParty {
  code: string;
  name: string;
  shortName: string;
  ballotNumber2024?: number;
  source: ParsedSource;
}

export interface ParsedPosition {
  personSlug: string;
  fullName: string;
  publishedName: string;
  nameVariants: string[];
  body: string;
  institutionCode: string;
  title: string;
  jurisdiction: string;
  dapilName: string;
  dapilCode: string;
  partyCode: string;
  faction: string;
  komisi: string;
  appointmentType: "elected" | "appointed" | "replacement";
  isActing: boolean;
  rank: string;
  startDate: string;
  startDatePrecision: "day" | "month" | "unknown";
  endDate: string;
  endDatePrecision: "day" | "month" | "unknown";
  status: "active" | "inactive" | "ended";
  previousPost: string;
  sources: ParsedSource[];
  verificationStatus: "needs_verification";
  notes: string;
  csvLine: number;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  parties: ParsedParty[];
  positions: ParsedPosition[];
}
