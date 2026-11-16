import { apiClient, ApiError } from './apiClient';

export const buddyService = {
  getBuddySetting: async (options = {}) => {
    try {
      const response = await apiClient.get('/settings/buddy/', options);
      return response.data || response;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return { enabled: false };
      }
      throw e;
    }
  },

  updateBuddySetting: async (payload, options = {}) => {
    const body = typeof payload === 'boolean' ? { enabled: payload } : payload;
    const response = await apiClient.patch('/settings/buddy/', body, options);
    return response.data || response;
  },

  getExamStatus: async (options = {}) => {
    const response = await apiClient.get('/buddy/status/', options);
    return response.data;
  },

  getExamRules: async (options = {}) => {
    try {
      const response = await apiClient.get('/buddy/rules/', options);
      return Array.isArray(response.data) ? response.data : [];
    } catch (e) {
      return [];
    }
  },

  createExamRule: async (ruleData, options = {}) => {
    const response = await apiClient.post('/buddy/rules/', ruleData, options);
    return response.data;
  },

  deleteExamRule: async (ruleId, options = {}) => {
    const response = await apiClient.delete(`/buddy/rules/${ruleId}/`, options);
    return response.data;
  },
};
