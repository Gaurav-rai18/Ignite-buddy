import { useState, useEffect, useCallback, useRef } from 'react';
import { assignmentService } from '../services/assignmentService';
import { formatErrorMessage } from '../utils/error';
import {
  ASSIGNMENT_RECIPIENT_MODES,
  DEFAULT_ASSIGNMENT_RECIPIENT_MODE,
} from '../constants';

export const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getInitialAssignmentForm = () => ({
  topic: '',
  subject: '',
  platform_link: '',
  start_date: getTodayStr(),
  deadline: '',
  message: '',
  recipientMode: DEFAULT_ASSIGNMENT_RECIPIENT_MODE,
  cohort_id: '',
  batch_id: '',
  sub_batch_id: '',
  stream_id: '',
  selectedBatchIds: [],
  selectedSubBatchIds: [],
  selectedStreamIds: [],
  audience: 'All Trainees',
});

export function validateAssignmentForm(form) {
  const todayStr = getTodayStr();
  const errors = {};

  if (!form.topic?.trim()) errors.topic = 'Topic is required.';
  if (!form.subject?.trim()) errors.subject = 'Subject is required.';

  if (!form.start_date) {
    errors.start_date = 'Start date is required.';
  } else if (form.start_date < todayStr) {
    errors.start_date = 'Start date cannot be in the past.';
  }

  if (!form.deadline) {
    errors.deadline = 'Deadline is required.';
  } else if (form.deadline < todayStr) {
    errors.deadline = 'Deadline cannot be in the past.';
  } else if (form.start_date && form.deadline < form.start_date) {
    errors.deadline = 'Deadline must be on or after the start date.';
  }

  if (!form.message?.trim()) {
    errors.message = 'Assignment message / instructions are required.';
  }

  const mode = form.recipientMode || DEFAULT_ASSIGNMENT_RECIPIENT_MODE;
  if (!ASSIGNMENT_RECIPIENT_MODES.includes(mode)) {
    errors.recipients = 'Invalid recipient targeting mode.';
  } else if (mode === 'By cohort' && !form.cohort_id) {
    errors.recipients = 'Please select a cohort.';
  } else if (
    mode === 'By batch' &&
    (!form.selectedBatchIds || form.selectedBatchIds.length === 0) &&
    !form.batch_id
  ) {
    errors.recipients = 'Please select at least one batch.';
  } else if (
    mode === 'By sub-batch' &&
    (!form.selectedSubBatchIds || form.selectedSubBatchIds.length === 0) &&
    !form.sub_batch_id
  ) {
    errors.recipients = 'Please select at least one sub-batch.';
  } else if (
    mode === 'By stream' &&
    (!form.selectedStreamIds || form.selectedStreamIds.length === 0) &&
    !form.stream_id
  ) {
    errors.recipients = 'Please select at least one elective stream.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

export function useAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [form, setForm] = useState(getInitialAssignmentForm);
  const [historyFilter, setHistoryFilter] = useState('mine'); // 'mine' | 'others'
  const [deadlineUpdating, setDeadlineUpdating] = useState({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchAssignments = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const data = await assignmentService.getAssignments({ signal });
      if (isMountedRef.current) setAssignments(data);
    } catch (err) {
      if (isMountedRef.current && err.name !== 'AbortError') {
        setError(formatErrorMessage(err));
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAssignments(controller.signal);
    return () => controller.abort();
  }, [fetchAssignments]);

  const updateFormField = useCallback((field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'recipientMode') {
        if (value === 'By cohort') {
          next.audience = 'By Cohort';
        } else if (value === 'By batch') {
          next.audience = 'Targeted Batches';
        } else if (value === 'By sub-batch') {
          next.audience = 'Targeted Sub-Batches';
        } else if (value === 'By stream') {
          next.audience = 'Targeted Streams';
        } else {
          next.audience = 'All Trainees';
        }
      }
      return next;
    });

    setFormErrors((prev) => {
      const updated = { ...prev };
      delete updated[field];
      delete updated.recipients;
      return updated;
    });
  }, []);

  const submitAssignment = useCallback(
    async (onSuccess) => {
      if (isSubmitting) return false;
      const validation = validateAssignmentForm(form);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return false;
      }

      setIsSubmitting(true);
      setError('');
      setFormErrors({});

      try {
        const payload = {
          topic: form.topic.trim(),
          subject: form.subject.trim(),
          platform_link: form.platform_link.trim() || '',
          start_date: form.start_date,
          deadline: form.deadline,
          message: form.message.trim(),
        };

        const mode = form.recipientMode || DEFAULT_ASSIGNMENT_RECIPIENT_MODE;
        if (mode === 'All Trainees' || mode === 'All users') {
          payload.recipient_mode = 'ALL';
        } else if (mode === 'By cohort') {
          payload.recipient_mode = 'COHORT';
          payload.cohort_id = parseInt(form.cohort_id, 10);
        } else if (mode === 'By batch') {
          payload.recipient_mode = 'BATCH';
          const bIds =
            form.selectedBatchIds.length > 0
              ? form.selectedBatchIds.map((id) => parseInt(id, 10))
              : form.batch_id
              ? [parseInt(form.batch_id, 10)]
              : [];
          payload.batch_ids = bIds;
        } else if (mode === 'By sub-batch') {
          payload.recipient_mode = 'SUB_BATCH';
          const sbIds =
            form.selectedSubBatchIds.length > 0
              ? form.selectedSubBatchIds.map((id) => parseInt(id, 10))
              : form.sub_batch_id
              ? [parseInt(form.sub_batch_id, 10)]
              : [];
          payload.sub_batch_ids = sbIds;
        } else if (mode === 'By stream') {
          payload.recipient_mode = 'STREAM';
          const sIds =
            form.selectedStreamIds?.length > 0
              ? form.selectedStreamIds.map((id) => parseInt(id, 10))
              : form.stream_id
              ? [parseInt(form.stream_id, 10)]
              : [];
          payload.stream_ids = sIds;
        }

        await assignmentService.createAssignment(payload);
        if (isMountedRef.current) setForm(getInitialAssignmentForm());
        await fetchAssignments();
        if (onSuccess) onSuccess('Assignment published successfully');
        return true;
      } catch (err) {
        if (isMountedRef.current) setError(formatErrorMessage(err));
        return false;
      } finally {
        if (isMountedRef.current) setIsSubmitting(false);
      }
    },
    [form, isSubmitting, fetchAssignments]
  );

  const updateDeadline = useCallback(
    async (id, deadline, onSuccess) => {
      const todayStr = getTodayStr();
      if (!deadline) {
        if (isMountedRef.current) setError('Deadline date cannot be empty.');
        return;
      }
      if (deadline < todayStr) {
        if (isMountedRef.current) setError('Deadline cannot be in the past.');
        return;
      }

      setDeadlineUpdating((prev) => ({ ...prev, [id]: true }));
      try {
        await assignmentService.updateAssignmentDeadline(id, deadline);
        setAssignments((prev) =>
          prev.map((a) => (String(a.id) === String(id) ? { ...a, deadline } : a))
        );
        if (onSuccess) onSuccess('Deadline updated successfully');
      } catch (err) {
        if (isMountedRef.current) setError(formatErrorMessage(err));
      } finally {
        if (isMountedRef.current) setDeadlineUpdating((prev) => ({ ...prev, [id]: false }));
      }
    },
    []
  );

  return {
    assignments,
    loading,
    isSubmitting,
    error,
    formErrors,
    form,
    historyFilter,
    deadlineUpdating,
    setHistoryFilter,
    updateFormField,
    submitAssignment,
    updateDeadline,
    refetch: fetchAssignments,
    clearError: () => setError(''),
  };
}
