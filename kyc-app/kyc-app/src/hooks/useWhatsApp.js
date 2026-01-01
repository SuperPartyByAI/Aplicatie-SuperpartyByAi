import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetch WhatsApp conversations
 * 
 * Cached for 30 seconds, auto-refetches every 30 seconds for real-time updates
 */
export const useConversations = () => {
  return useQuery({
    queryKey: ['whatsapp', 'conversations'],
    queryFn: async () => {
      const q = query(
        collection(db, 'conversations'),
        orderBy('lastMessageAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    staleTime: 30 * 1000, // 30 seconds (real-time data)
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
};

/**
 * Fetch messages for a specific conversation
 * 
 * @param {string} conversationId - Conversation ID
 */
export const useMessages = (conversationId) => {
  return useQuery({
    queryKey: ['whatsapp', 'messages', conversationId],
    queryFn: async () => {
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId),
        orderBy('timestamp', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    enabled: !!conversationId,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
  });
};

/**
 * Fetch WhatsApp accounts
 * 
 * Cached for 2 minutes
 */
export const useWhatsAppAccounts = () => {
  return useQuery({
    queryKey: ['whatsapp', 'accounts'],
    queryFn: async () => {
      const response = await fetch('/api/accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      return data.accounts || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Send WhatsApp message
 * 
 * Automatically invalidates messages for the conversation after success
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, message, to }) => {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message, to }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate messages for this conversation
      queryClient.invalidateQueries({
        queryKey: ['whatsapp', 'messages', variables.conversationId],
      });
      // Invalidate conversations list (to update last message)
      queryClient.invalidateQueries({
        queryKey: ['whatsapp', 'conversations'],
      });
    },
  });
};

/**
 * Get QR code for WhatsApp account
 * 
 * @param {string} accountId - Account ID
 */
export const useWhatsAppQR = (accountId) => {
  return useQuery({
    queryKey: ['whatsapp', 'qr', accountId],
    queryFn: async () => {
      const response = await fetch(`/api/qr/${accountId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch QR code');
      }
      return response.json();
    },
    enabled: !!accountId,
    staleTime: 5 * 1000, // 5 seconds (QR codes expire quickly)
    refetchInterval: 5 * 1000, // Refetch every 5 seconds
  });
};
