export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Recipient targeting modes for the Broadcast composer
export const RECIPIENT_MODES = ['All users', 'By role', 'By cohort', 'By batch', 'By sub-batch', 'By stream', 'Specific users'];

export const DEFAULT_RECIPIENT_MODE = 'All users';

// Recipient targeting modes for the Assignment composer (strictly trainee-focused)
export const ASSIGNMENT_RECIPIENT_MODES = [
  'All Trainees',
  'By cohort',
  'By batch',
  'By sub-batch',
  'By stream',
];

export const DEFAULT_ASSIGNMENT_RECIPIENT_MODE = 'All Trainees';

// Role-based targeting uses the existing Broadcast `audience` label.
export const ROLE_OPTIONS = ['TRAINEE', 'TA', 'HR', 'MANAGER', 'ADMIN'];

export const SPECIFIC_RECIPIENTS_SUPPORTED = true;

export const VALIDATION_LIMITS = {
  BROADCAST_TITLE_MAX: 160,
  BROADCAST_MESSAGE_MAX: 2000,
  SCHEDULE_TITLE_MAX: 160,
};

export const REQUEST_TIMEOUT_MS = 15000;
