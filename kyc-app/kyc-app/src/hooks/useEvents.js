import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetch all events
 * 
 * Cached for 5 minutes, automatically refetches in background
 */
export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'events'));
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Fetch single event by ID
 * 
 * @param {string} eventId - Event ID
 */
export const useEvent = (eventId) => {
  return useQuery({
    queryKey: ['events', eventId],
    queryFn: async () => {
      const docRef = doc(db, 'events', eventId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    },
    enabled: !!eventId, // Only run if eventId exists
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Create new event
 * 
 * Automatically invalidates events list after success
 */
export const useCreateEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventData) => {
      const docRef = await addDoc(collection(db, 'events'), {
        ...eventData,
        createdAt: new Date().toISOString(),
      });
      return { id: docRef.id, ...eventData };
    },
    onSuccess: () => {
      // Invalidate and refetch events list
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};

/**
 * Update existing event
 * 
 * Automatically invalidates affected queries after success
 */
export const useUpdateEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, data }) => {
      const docRef = doc(db, 'events', eventId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      return { eventId, data };
    },
    onSuccess: (result) => {
      // Invalidate specific event and events list
      queryClient.invalidateQueries({ queryKey: ['events', result.eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};

/**
 * Delete event
 * 
 * Automatically invalidates events list after success
 */
export const useDeleteEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId) => {
      const docRef = doc(db, 'events', eventId);
      await deleteDoc(docRef);
      return eventId;
    },
    onSuccess: (eventId) => {
      // Remove from cache and invalidate list
      queryClient.removeQueries({ queryKey: ['events', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};
