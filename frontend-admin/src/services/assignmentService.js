import { apiClient, ApiError } from './apiClient';

export const assignmentService = {
  getAssignments: async (options = {}) => {
    try {
      const response = await apiClient.get('/assignments/', options);
      return Array.isArray(response.data) ? response.data : [];
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return [];
      }
      throw e;
    }
  },

  createAssignment: async (assignmentData, options = {}) => {
    const response = await apiClient.post('/assignments/', assignmentData, options);
    return response.data;
  },

  updateAssignment: async (id, assignmentData, options = {}) => {
    const response = await apiClient.patch(
      `/assignments/${id}/`,
      assignmentData,
      options
    );
    return response.data;
  },

  updateAssignmentDeadline: async (id, deadline, options = {}) => {
    const response = await apiClient.patch(
      `/assignments/${id}/`,
      { deadline },
      options
    );
    return response.data;
  },

  deleteAssignment: async (id, options = {}) => {
    const response = await apiClient.delete(`/assignments/${id}/`, options);
    return response.data;
  },
};
