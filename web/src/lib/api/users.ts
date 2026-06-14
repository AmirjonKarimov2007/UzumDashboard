import { apiClient } from './client';

export interface UserProfile {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  usdRate?: number;
  isActive?: boolean;
  stores?: any[];
}

export interface UpdateProfileBody {
  name?: string;
  email?: string;
  avatar?: string;
  usdRate?: number;
}

export const usersApi = {
  getMe: (): Promise<UserProfile> =>
    apiClient.get('/users/me').then((r) => r.data),

  updateMe: (body: UpdateProfileBody): Promise<UserProfile> =>
    apiClient.patch('/users/me', body).then((r) => r.data),
};
