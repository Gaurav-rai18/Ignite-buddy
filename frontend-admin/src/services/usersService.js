import { apiClient } from "./apiClient";

export const usersService = {
  getUsers: async () => {
    const response = await apiClient.get("/accounts/users/");
    return response.data;
  },

  createUser: async (userData) => {
    const response = await apiClient.post("/accounts/users/", userData);
    return response.data;
  },

  updateUser: async (userId, userData) => {
    const response = await apiClient.patch(`/accounts/users/${userId}/`, userData);
    return response.data;
  },

  deleteUser: async (userId) => {
    const response = await apiClient.delete(`/accounts/users/${userId}/`);
    return response.data;
  },

  getUserById: async (userId) => {
    const response = await apiClient.get(`/accounts/users/${userId}/`);
    return response.data;
  },

  resetPassword: async (userId, newPassword) => {
    const response = await apiClient.post(
      `/accounts/users/${userId}/reset-password/`,
      { new_password: newPassword }
    );
    return response.data;
  },

  bulkUploadUsers: async (file, csvText = "") => {
    const formData = new FormData();
    formData.append("type", "users");
    if (file) {
      formData.append("file", file);
    }
    if (csvText) {
      formData.append("csv_text", csvText);
    }
    const response = await apiClient.post(
      "/accounts/bulk-import/",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
      }
    );
    return response.data;
  },

  bulkImportMasterData: async (type, file, csvText = "") => {
    const formData = new FormData();
    formData.append("type", type);
    if (file) {
      formData.append("file", file);
    }
    if (csvText) {
      formData.append("csv_text", csvText);
    }
    const response = await apiClient.post(
      "/accounts/bulk-import/",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
      }
    );
    return response.data;
  },

  getCohorts: async () => {
    const response = await apiClient.get("/accounts/cohorts/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getBatches: async (cohortId) => {
    const response = await apiClient.get("/accounts/batches/", {
      params: cohortId ? { cohort: cohortId } : {},
    });
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getSubBatches: async (batchId) => {
    const response = await apiClient.get("/accounts/sub-batches/", {
      params: batchId ? { batch: batchId } : {},
    });
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getLabs: async () => {
    const response = await apiClient.get("/accounts/labs/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getStreams: async () => {
    const response = await apiClient.get("/accounts/streams/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getSubjects: async () => {
    const response = await apiClient.get("/accounts/subjects/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  createSubBatch: async (data) => {
    const response = await apiClient.post("/accounts/sub-batches/", data);
    return response.data;
  },

  createBatch: async (data) => {
    const response = await apiClient.post("/accounts/batches/", data);
    return response.data;
  },

  createCohort: async (data) => {
    const response = await apiClient.post("/accounts/cohorts/", data);
    return response.data;
  },

  createLab: async (data) => {
    const response = await apiClient.post("/accounts/labs/", data);
    return response.data;
  },

  createStream: async (data) => {
    const response = await apiClient.post("/accounts/streams/", data);
    return response.data;
  },

  createSubject: async (data) => {
    const response = await apiClient.post("/accounts/subjects/", data);
    return response.data;
  },

  updateCohort: async (id, data) => {
    const response = await apiClient.patch(`/accounts/cohorts/${id}/`, data);
    return response.data;
  },

  updateBatch: async (id, data) => {
    const response = await apiClient.patch(`/accounts/batches/${id}/`, data);
    return response.data;
  },

  updateSubBatch: async (id, data) => {
    const response = await apiClient.patch(`/accounts/sub-batches/${id}/`, data);
    return response.data;
  },

  updateLab: async (id, data) => {
    const response = await apiClient.patch(`/accounts/labs/${id}/`, data);
    return response.data;
  },

  updateStream: async (id, data) => {
    const response = await apiClient.patch(`/accounts/streams/${id}/`, data);
    return response.data;
  },

  updateSubject: async (id, data) => {
    const response = await apiClient.patch(`/accounts/subjects/${id}/`, data);
    return response.data;
  },

  deleteSubBatch: async (id) => {
    const response = await apiClient.delete(`/accounts/sub-batches/${id}/`);
    return response.data;
  },

  deleteBatch: async (id) => {
    const response = await apiClient.delete(`/accounts/batches/${id}/`);
    return response.data;
  },

  deleteCohort: async (id) => {
    const response = await apiClient.delete(`/accounts/cohorts/${id}/`);
    return response.data;
  },

  deleteLab: async (id) => {
    const response = await apiClient.delete(`/accounts/labs/${id}/`);
    return response.data;
  },

  deleteStream: async (id) => {
    const response = await apiClient.delete(`/accounts/streams/${id}/`);
    return response.data;
  },

  deleteSubject: async (id) => {
    const response = await apiClient.delete(`/accounts/subjects/${id}/`);
    return response.data;
  },
};
