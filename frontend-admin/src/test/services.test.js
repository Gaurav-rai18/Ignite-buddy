import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '../services/apiClient';
import { usersService } from '../services/usersService';
import { assignmentService } from '../services/assignmentService';
import { broadcastService } from '../services/broadcastService';
import { buddyService } from '../services/buddyService';
import { dashboardService } from '../services/dashboardService';
import { scheduleService } from '../services/scheduleService';
import { profileService } from '../services/profileService';
import { settingsService } from '../services/settingsService';
import { documentsService, formatFileSize } from '../services/documentsService';

const ok = (data) => Promise.resolve({ data });

function spy() {
  return {
    get: vi.spyOn(apiClient, 'get'),
    post: vi.spyOn(apiClient, 'post'),
    patch: vi.spyOn(apiClient, 'patch'),
    put: vi.spyOn(apiClient, 'put'),
    delete: vi.spyOn(apiClient, 'delete'),
  };
}

describe('Service Layer (API contracts)', () => {
  let s;
  beforeEach(() => {
    s = spy();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('usersService', () => {
    it('lists users', async () => {
      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await usersService.getUsers()).toEqual([{ id: 1 }]);
      expect(s.get).toHaveBeenCalledWith('/accounts/users/');
    });

    it('creates, updates, fetches and deletes users', async () => {
      s.post.mockReturnValue(ok({ id: 5 }));
      s.patch.mockReturnValue(ok({ id: 5, first_name: 'A' }));
      s.get.mockReturnValue(ok({ id: 5 }));
      s.delete.mockReturnValue(ok(null));

      expect(await usersService.createUser({ email: 'a@b.c' })).toEqual({ id: 5 });
      expect(s.post).toHaveBeenCalledWith('/accounts/users/', { email: 'a@b.c' });

      expect(await usersService.updateUser(5, { first_name: 'A' })).toEqual({ id: 5, first_name: 'A' });
      expect(s.patch).toHaveBeenCalledWith('/accounts/users/5/', { first_name: 'A' });

      expect(await usersService.getUserById(5)).toEqual({ id: 5 });
      expect(s.get).toHaveBeenCalledWith('/accounts/users/5/');

      expect(await usersService.deleteUser(5)).toBeNull();
      expect(s.delete).toHaveBeenCalledWith('/accounts/users/5/');
    });

    it('resets a user password', async () => {
      s.post.mockReturnValue(ok({ detail: 'ok' }));
      await usersService.resetPassword(7, 'NewPass#123');
      expect(s.post).toHaveBeenCalledWith('/accounts/users/7/reset-password/', {
        new_password: 'NewPass#123',
      });
    });

    it('uploads users as multipart form data with a long timeout', async () => {
      s.post.mockReturnValue(ok({ created: 2 }));
      const file = new File(['a,b'], 'users.csv', { type: 'text/csv' });

      const res = await usersService.bulkUploadUsers(file, 'a,b');

      expect(res).toEqual({ created: 2 });
      const [url, body, config] = s.post.mock.calls[0];
      expect(url).toBe('/accounts/bulk-import/');
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('type')).toBe('users');
      expect(body.get('csv_text')).toBe('a,b');
      expect(body.get('file')).toBe(file);
      expect(config).toMatchObject({ headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 });
    });

    it('bulk-imports master data with a caller-supplied type', async () => {
      s.post.mockReturnValue(ok({ created: 1 }));
      await usersService.bulkImportMasterData('cohorts', null, 'code,name');
      const [, body] = s.post.mock.calls[0];
      expect(body.get('type')).toBe('cohorts');
      expect(body.get('csv_text')).toBe('code,name');
      expect(body.has('file')).toBe(false);
    });

    it('normalises list endpoints for both plain and paginated payloads', async () => {
      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await usersService.getCohorts()).toEqual([{ id: 1 }]);

      s.get.mockReturnValue(ok({ results: [{ id: 2 }] }));
      expect(await usersService.getCohorts()).toEqual([{ id: 2 }]);

      s.get.mockReturnValue(ok({ unexpected: true }));
      expect(await usersService.getCohorts()).toEqual([]);
    });

    it('passes optional cohort/batch filters as query params', async () => {
      s.get.mockReturnValue(ok([]));
      await usersService.getBatches(3);
      expect(s.get).toHaveBeenCalledWith('/accounts/batches/', { params: { cohort: 3 } });

      await usersService.getSubBatches();
      expect(s.get).toHaveBeenCalledWith('/accounts/sub-batches/', { params: {} });
    });

    it('covers lab/stream/subject list + CRUD endpoints', async () => {
      s.get.mockReturnValue(ok([]));
      s.post.mockReturnValue(ok({ id: 9 }));
      s.patch.mockReturnValue(ok({ id: 9 }));
      s.delete.mockReturnValue(ok(null));

      await usersService.getLabs();
      await usersService.getStreams();
      await usersService.getSubjects();
      expect(s.get).toHaveBeenCalledWith('/accounts/labs/');
      expect(s.get).toHaveBeenCalledWith('/accounts/streams/');
      expect(s.get).toHaveBeenCalledWith('/accounts/subjects/');

      await usersService.createCohort({ code: 'B51' });
      await usersService.createBatch({ name: 'A' });
      await usersService.createSubBatch({ name: 'A1' });
      await usersService.createLab({ code: 'L1' });
      await usersService.createStream({ code: 'S1' });
      await usersService.createSubject({ code: 'SUB' });
      expect(s.post).toHaveBeenCalledWith('/accounts/cohorts/', { code: 'B51' });
      expect(s.post).toHaveBeenCalledWith('/accounts/subjects/', { code: 'SUB' });

      await usersService.updateCohort(1, { code: 'B52' });
      await usersService.updateBatch(1, {});
      await usersService.updateSubBatch(1, {});
      await usersService.updateLab(1, {});
      await usersService.updateStream(1, {});
      await usersService.updateSubject(1, {});
      expect(s.patch).toHaveBeenCalledWith('/accounts/cohorts/1/', { code: 'B52' });

      await usersService.deleteCohort(1);
      await usersService.deleteBatch(1);
      await usersService.deleteSubBatch(1);
      await usersService.deleteLab(1);
      await usersService.deleteStream(1);
      await usersService.deleteSubject(1);
      expect(s.delete).toHaveBeenCalledWith('/accounts/subjects/1/');
    });
  });

  describe('assignmentService', () => {
    it('returns an array or an empty list', async () => {
      const options = { signal: 'sig' };
      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await assignmentService.getAssignments(options)).toEqual([{ id: 1 }]);
      expect(s.get).toHaveBeenCalledWith('/assignments/', options);

      s.get.mockReturnValue(ok({ not: 'an array' }));
      expect(await assignmentService.getAssignments()).toEqual([]);
    });

    it('swallows 404 but rethrows other errors', async () => {
      s.get.mockReturnValue(Promise.reject(new ApiError('nope', 404)));
      expect(await assignmentService.getAssignments()).toEqual([]);

      s.get.mockReturnValue(Promise.reject(new ApiError('boom', 500)));
      await expect(assignmentService.getAssignments()).rejects.toThrow('boom');
    });

    it('creates, updates, reschedules and deletes assignments', async () => {
      s.post.mockReturnValue(ok({ id: 2 }));
      s.patch.mockReturnValue(ok({ id: 2 }));
      s.delete.mockReturnValue(ok(null));

      await assignmentService.createAssignment({ title: 'HW' });
      expect(s.post).toHaveBeenCalledWith('/assignments/', { title: 'HW' }, {});

      await assignmentService.updateAssignment(2, { title: 'HW2' });
      expect(s.patch).toHaveBeenCalledWith('/assignments/2/', { title: 'HW2' }, {});

      await assignmentService.updateAssignmentDeadline(2, '2030-01-01');
      expect(s.patch).toHaveBeenCalledWith('/assignments/2/', { deadline: '2030-01-01' }, {});

      await assignmentService.deleteAssignment(2);
      expect(s.delete).toHaveBeenCalledWith('/assignments/2/', {});
    });
  });

  describe('broadcastService', () => {
    it('fetches broadcast history and handles 404', async () => {
      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await broadcastService.getBroadcasts()).toEqual([{ id: 1 }]);
      expect(s.get).toHaveBeenCalledWith('/notifications/broadcast/history/', {});

      s.get.mockReturnValue(Promise.reject(new ApiError('gone', 404)));
      expect(await broadcastService.getBroadcasts()).toEqual([]);

      s.get.mockReturnValue(Promise.reject(new ApiError('bad', 400)));
      await expect(broadcastService.getBroadcasts()).rejects.toThrow('bad');
    });

    it('creates broadcasts', async () => {
      s.post.mockReturnValue(ok({ id: 9 }));
      await broadcastService.createBroadcast({ title: 'T' }, { signal: 1 });
      expect(s.post).toHaveBeenCalledWith('/notifications/broadcast/', { title: 'T' }, { signal: 1 });
    });
  });

  describe('buddyService', () => {
    it('gets the buddy setting and defaults to disabled on 404', async () => {
      s.get.mockReturnValue(ok({ enabled: true }));
      expect(await buddyService.getBuddySetting()).toEqual({ enabled: true });

      s.get.mockReturnValue(Promise.reject(new ApiError('missing', 404)));
      expect(await buddyService.getBuddySetting()).toEqual({ enabled: false });

      s.get.mockReturnValue(Promise.reject(new ApiError('err', 500)));
      await expect(buddyService.getBuddySetting()).rejects.toThrow('err');
    });

    it('normalises boolean and object payloads on update', async () => {
      s.patch.mockReturnValue(ok({ enabled: true }));
      await buddyService.updateBuddySetting(true);
      expect(s.patch).toHaveBeenCalledWith('/settings/buddy/', { enabled: true }, {});

      await buddyService.updateBuddySetting({ enabled: false });
      expect(s.patch).toHaveBeenCalledWith('/settings/buddy/', { enabled: false }, {});
    });

    it('reads exam status and rules (rules degrade to [])', async () => {
      s.get.mockReturnValue(ok({ active: true }));
      expect(await buddyService.getExamStatus()).toEqual({ active: true });
      expect(s.get).toHaveBeenCalledWith('/buddy/status/', {});

      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await buddyService.getExamRules()).toEqual([{ id: 1 }]);

      s.get.mockReturnValue(Promise.reject(new ApiError('x', 500)));
      expect(await buddyService.getExamRules()).toEqual([]);
    });

    it('creates and deletes exam policy rules', async () => {
      s.post.mockReturnValue(ok({ id: 4 }));
      s.delete.mockReturnValue(ok(null));
      await buddyService.createExamRule({ action: 'BLOCK' });
      expect(s.post).toHaveBeenCalledWith('/buddy/rules/', { action: 'BLOCK' }, {});
      await buddyService.deleteExamRule(4);
      expect(s.delete).toHaveBeenCalledWith('/buddy/rules/4/', {});
    });
  });

  describe('dashboardService', () => {
    it('normalises numeric and boolean fields', async () => {
      s.get.mockReturnValue(ok({ broadcast_count: '5', scheduled_count: 2, buddy_enabled: 1, total_users: '10' }));
      expect(await dashboardService.getSummary()).toEqual({
        broadcast_count: 5,
        scheduled_count: 2,
        upcoming_count: 0,
        buddy_enabled: true,
        total_users: 10,
        total_trainees: 0,
        total_cohorts: 0,
        total_batches: 0,
        total_sub_batches: 0,
      });
    });

    it('returns zeroed defaults on 404 and rethrows others', async () => {
      s.get.mockReturnValue(Promise.reject(new ApiError('no', 404)));
      const summary = await dashboardService.getSummary();
      expect(summary.broadcast_count).toBe(0);
      expect(summary.buddy_enabled).toBe(false);

      s.get.mockReturnValue(Promise.reject(new ApiError('bad', 503)));
      await expect(dashboardService.getSummary()).rejects.toThrow('bad');
    });
  });

  describe('scheduleService', () => {
    it('lists schedules with params and handles 404', async () => {
      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await scheduleService.getSchedules({ is_active: true })).toEqual([{ id: 1 }]);
      expect(s.get).toHaveBeenCalledWith('/schedules/', { params: { is_active: true } });

      s.get.mockReturnValue(Promise.reject(new ApiError('none', 404)));
      expect(await scheduleService.getSchedules()).toEqual([]);
    });

    it('fetches, creates, updates and deletes schedules', async () => {
      s.get.mockReturnValue(ok({ id: 1 }));
      s.post.mockReturnValue(ok({ id: 1 }));
      s.put.mockReturnValue(ok({ id: 1, title: 'X' }));
      s.delete.mockReturnValue(ok(null));

      expect(await scheduleService.getScheduleById(1)).toEqual({ id: 1 });
      await scheduleService.createSchedule({ title: 'X' });
      expect(s.post).toHaveBeenCalledWith('/schedules/', { title: 'X' }, {});
      await scheduleService.updateSchedule(1, { title: 'X' });
      expect(s.put).toHaveBeenCalledWith('/schedules/1/', { title: 'X' }, {});
      await scheduleService.deleteSchedule(1);
      expect(s.delete).toHaveBeenCalledWith('/schedules/1/', {});
    });

    it('activates a schedule, falling back to PUT when POST fails', async () => {
      s.post.mockReturnValue(ok({ is_active: true }));
      expect(await scheduleService.activateSchedule(1)).toEqual({ is_active: true });
      expect(s.post).toHaveBeenCalledWith('/schedules/1/activate/', {}, {});

      s.post.mockReturnValue(Promise.reject(new ApiError('missing', 404)));
      s.put.mockReturnValue(ok({ is_active: true }));
      await scheduleService.activateSchedule(1);
      expect(s.put).toHaveBeenCalledWith('/schedules/1/', { is_active: true, force_activate: true }, {});
    });

    it('parses Excel timetables and fetches live timetable + seating', async () => {
      s.post.mockReturnValue(ok({ slots: 3 }));
      s.get.mockReturnValue(ok({ batch: 'B50', slots: [] }));

      const file = new File(['x'], 'tt.xlsx');
      await scheduleService.parseExcelSchedule(file);
      const [url, body, config] = s.post.mock.calls[0];
      expect(url).toBe('/schedules/parse-excel/');
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('file')).toBe(file);
      expect(config.headers['Content-Type']).toBe('multipart/form-data');

      await scheduleService.getLiveTimetable('B50');
      expect(s.get).toHaveBeenCalledWith('/schedules/live-timetable/', { params: { batch: 'B50' } });

      await scheduleService.getCurrentSeating({ batch: 'B50' });
      expect(s.get).toHaveBeenCalledWith('/schedules/current-seating/', { params: { batch: 'B50' } });
    });
  });

  describe('profileService', () => {
    it('gets/updates the profile and maps password payloads', async () => {
      s.get.mockReturnValue(ok({ email: 'a@b.c' }));
      s.patch.mockReturnValue(ok({ email: 'a@b.c', first_name: 'A' }));
      s.post.mockReturnValue(ok({ detail: 'done' }));

      expect(await profileService.getProfile()).toEqual({ email: 'a@b.c' });
      expect(s.get).toHaveBeenCalledWith('/accounts/me/');

      expect(await profileService.updateProfile({ first_name: 'A' })).toEqual({ email: 'a@b.c', first_name: 'A' });
      expect(s.patch).toHaveBeenCalledWith('/accounts/me/', { first_name: 'A' });

      await profileService.changePassword({ oldPassword: 'old', newPassword: 'newPass1' });
      expect(s.post).toHaveBeenCalledWith('/accounts/change-password/', {
        old_password: 'old',
        new_password: 'newPass1',
      });
    });
  });

  describe('settingsService', () => {
    it('reads and writes preferences', async () => {
      s.get.mockReturnValue(ok({ theme: 'dark' }));
      s.post.mockReturnValue(ok({ theme: 'light' }));

      expect(await settingsService.getPreferences()).toEqual({ theme: 'dark' });
      expect(s.get).toHaveBeenCalledWith('/settings/preferences/');
      expect(await settingsService.updatePreferences({ theme: 'light' })).toEqual({ theme: 'light' });
      expect(s.post).toHaveBeenCalledWith('/settings/preferences/', { theme: 'light' });
    });

    it('reads and writes roles & permissions', async () => {
      s.get.mockReturnValue(ok({ roles: {} }));
      s.post.mockReturnValue(ok({ roles: { ADMIN: [] } }));

      await settingsService.getRolesPermissions();
      expect(s.get).toHaveBeenCalledWith('/accounts/roles-permissions/');
      await settingsService.updateRolesPermissions({ ADMIN: [] });
      expect(s.post).toHaveBeenCalledWith('/accounts/roles-permissions/', { roles: { ADMIN: [] } });
    });

    it('exports users CSV by triggering a browser download', async () => {
      const createUrl = vi.fn(() => 'blob:csv');
      const revokeUrl = vi.fn();
      const originalCreate = window.URL.createObjectURL;
      const originalRevoke = window.URL.revokeObjectURL;
      window.URL.createObjectURL = createUrl;
      window.URL.revokeObjectURL = revokeUrl;

      s.get.mockReturnValue(ok('a,b\n1,2'));
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const result = await settingsService.exportUsersCSV();

      expect(result).toBe(true);
      expect(s.get).toHaveBeenCalledWith('/settings/export/?type=users', { responseType: 'blob' });
      expect(createUrl).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeUrl).toHaveBeenCalled();

      window.URL.createObjectURL = originalCreate;
      window.URL.revokeObjectURL = originalRevoke;
    });

    it('fetches the audit summary', async () => {
      s.get.mockReturnValue(ok({ total_users: 3 }));
      expect(await settingsService.exportAuditSummary()).toEqual({ total_users: 3 });
      expect(s.get).toHaveBeenCalledWith('/settings/export/?type=audit');
    });
  });

  describe('documentsService', () => {
    it('lists documents, degrading to [] for non-arrays', async () => {
      s.get.mockReturnValue(ok([{ id: 1 }]));
      expect(await documentsService.getDocuments()).toEqual([{ id: 1 }]);

      s.get.mockReturnValue(ok({ results: [] }));
      expect(await documentsService.getDocuments()).toEqual([]);
    });

    it('uploads documents with all optional fields as form data', async () => {
      s.post.mockReturnValue(ok({ id: 3 }));
      const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });

      await documentsService.uploadDocument({
        file,
        name: 'Doc',
        space: 'general',
        audience: 'All students',
        description: 'd',
        cohort_id: 1,
        batch_id: 2,
      });

      const [url, body] = s.post.mock.calls[0];
      expect(url).toBe('/documents/');
      expect(body.get('file')).toBe(file);
      expect(body.get('name')).toBe('Doc');
      expect(body.get('cohort_id')).toBe('1');
      expect(body.get('batch_id')).toBe('2');
    });

    it('omits optional fields when not provided', async () => {
      s.post.mockReturnValue(ok({ id: 4 }));
      const file = new File(['x'], 'd.txt');
      await documentsService.uploadDocument({ file });
      const [, body] = s.post.mock.calls[0];
      expect(body.has('name')).toBe(false);
      expect(body.has('description')).toBe(false);
      // defaults still applied
      expect(body.get('space')).toBe('general');
      expect(body.get('audience')).toBe('All students');
    });

    it('reads stats, details and deletes documents', async () => {
      s.get.mockReturnValue(ok({ documents: 5 }));
      s.delete.mockReturnValue(ok(null));

      expect(await documentsService.getKnowledgeBaseStats()).toEqual({ documents: 5 });
      expect(s.get).toHaveBeenCalledWith('/documents/stats/', {});
      await documentsService.getDocumentDetails(3);
      expect(s.get).toHaveBeenCalledWith('/documents/3/', {});
      await documentsService.deleteDocument(3);
      expect(s.delete).toHaveBeenCalledWith('/documents/3/', {});
    });

    it('resolves blob URLs defensively', () => {
      expect(documentsService.getDocumentBlobUrl(null)).toBeNull();
      expect(documentsService.getDocumentBlobUrl({ fileUrl: 'https://x/y.pdf' })).toBe('https://x/y.pdf');

      const originalCreate = window.URL.createObjectURL;
      window.URL.createObjectURL = vi.fn(() => 'blob:doc');
      expect(documentsService.getDocumentBlobUrl({ content: 'hello' })).toBe('blob:doc');
      window.URL.createObjectURL = originalCreate;

      expect(documentsService.getDocumentBlobUrl({})).toBeNull();
    });

    it('formats file sizes', () => {
      // parseFloat(toFixed(1)) drops trailing zeros: 1024 -> '1 KB'
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1572864)).toBe('1.5 MB');
    });
  });
});
