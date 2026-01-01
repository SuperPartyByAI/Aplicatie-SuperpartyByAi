import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetch user profile
 * 
 * @param {string} userId - User ID
 * 
 * Cached for 10 minutes (profile changes less frequently)
 */
export const useProfile = (userId) => {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Update user profile
 * 
 * Automatically invalidates profile cache after success
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }) => {
      const docRef = doc(db, 'users', userId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      return { userId, data };
    },
    onMutate: async ({ userId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['profile', userId] });

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData(['profile', userId]);

      // Optimistically update
      queryClient.setQueryData(['profile', userId], (old) => ({
        ...old,
        ...data,
      }));

      // Return context with previous value
      return { previousProfile };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['profile', variables.userId], context.previousProfile);
    },
    onSettled: (data) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['profile', data.userId] });
    },
  });
};

/**
 * Create user profile
 * 
 * Automatically invalidates profile cache after success
 */
export const useCreateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }) => {
      const docRef = doc(db, 'users', userId);
      await setDoc(docRef, {
        ...data,
        createdAt: new Date().toISOString(),
      });
      return { userId, data };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profile', result.userId] });
    },
  });
};
