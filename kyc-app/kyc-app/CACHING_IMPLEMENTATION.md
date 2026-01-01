# Frontend Caching Implementation Guide

## 🚀 Quick Start: TanStack Query (30 Minutes)

This guide will walk you through implementing TanStack Query in your React app for immediate performance improvements.

---

## Step 1: Install Dependencies (2 minutes)

```bash
cd kyc-app/kyc-app
npm install @tanstack/react-query @tanstack/react-query-devtools
```

---

## Step 2: Setup QueryClient (5 minutes)

**File: `src/queryClient.js`** (new file)

```javascript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      
      // Cache data for 10 minutes
      cacheTime: 10 * 60 * 1000,
      
      // Don't refetch on window focus (can be annoying)
      refetchOnWindowFocus: false,
      
      // Retry failed requests once
      retry: 1,
      
      // Show cached data while fetching new data
      refetchOnMount: 'always',
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
```

---

## Step 3: Wrap App with Provider (3 minutes)

**File: `src/main.jsx`** (modify existing)

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './queryClient';

// Sentry and Logtail imports...
import './sentry';
import './logtail';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* DevTools only in development */}
      {import.meta.env.DEV && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
      )}
    </QueryClientProvider>
  </React.StrictMode>
);
```

---

## Step 4: Create Query Hooks (15 minutes)

### Events Hook

**File: `src/hooks/useEvents.js`** (new file)

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Fetch all events
export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'events'));
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Fetch single event
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

// Update event mutation
export const useUpdateEvent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ eventId, data }) => {
      const docRef = doc(db, 'events', eventId);
      await updateDoc(docRef, data);
      return { eventId, data };
    },
    onSuccess: (data) => {
      // Invalidate and refetch events
      queryClient.invalidateQueries(['events']);
      queryClient.invalidateQueries(['events', data.eventId]);
    },
  });
};

// Create event mutation
export const useCreateEvent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (eventData) => {
      const docRef = await addDoc(collection(db, 'events'), eventData);
      return { id: docRef.id, ...eventData };
    },
    onSuccess: () => {
      // Invalidate events list
      queryClient.invalidateQueries(['events']);
    },
  });
};
```

---

### User Profile Hook

**File: `src/hooks/useProfile.js`** (new file)

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const useProfile = (userId) => {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes (profile changes less frequently)
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, data }) => {
      const docRef = doc(db, 'users', userId);
      await updateDoc(docRef, data);
      return { userId, data };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['profile', data.userId]);
    },
  });
};
```

---

### WhatsApp Conversations Hook

**File: `src/hooks/useWhatsApp.js`** (new file)

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

// Fetch conversations
export const useConversations = () => {
  return useQuery({
    queryKey: ['whatsapp', 'conversations'],
    queryFn: async () => {
      const q = query(
        collection(db, 'conversations'),
        orderBy('lastMessageAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    staleTime: 30 * 1000, // 30 seconds (real-time data)
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
};

// Fetch messages for a conversation
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
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    enabled: !!conversationId,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
  });
};

// Send message mutation
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ conversationId, message }) => {
      // Call your API to send message
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message }),
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate messages for this conversation
      queryClient.invalidateQueries(['whatsapp', 'messages', variables.conversationId]);
      queryClient.invalidateQueries(['whatsapp', 'conversations']);
    },
  });
};
```

---

## Step 5: Use Hooks in Components (5 minutes)

### Example: Events Screen

**File: `src/screens/EvenimenteScreen.jsx`** (modify existing)

```javascript
import { useEvents, useCreateEvent } from '../hooks/useEvents';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

function EvenimenteScreen() {
  const { data: events, isLoading, error, refetch } = useEvents();
  const createEvent = useCreateEvent();

  const handleCreateEvent = async (eventData) => {
    try {
      await createEvent.mutateAsync(eventData);
      // Success! Events list will auto-update
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Se încarcă evenimentele..." />;
  }

  if (error) {
    return (
      <ErrorMessage 
        error={error} 
        onRetry={refetch}
      />
    );
  }

  return (
    <div>
      <h1>Evenimente</h1>
      
      {/* Show loading state for mutation */}
      {createEvent.isLoading && <p>Se creează evenimentul...</p>}
      
      {/* Events list */}
      {events?.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
      
      {/* Create button */}
      <button onClick={() => handleCreateEvent({ title: 'New Event' })}>
        Creează Eveniment
      </button>
    </div>
  );
}
```

---

### Example: WhatsApp Chat Screen

**File: `src/screens/WhatsAppChatScreen.jsx`** (modify existing)

```javascript
import { useMessages, useSendMessage } from '../hooks/useWhatsApp';
import { useState } from 'react';

function WhatsAppChatScreen({ conversationId }) {
  const [message, setMessage] = useState('');
  const { data: messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();

  const handleSend = async () => {
    if (!message.trim()) return;
    
    try {
      await sendMessage.mutateAsync({
        conversationId,
        message: message.trim(),
      });
      setMessage(''); // Clear input
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      {/* Messages list */}
      <div className="messages">
        {messages?.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      
      {/* Input */}
      <div className="input">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={sendMessage.isLoading}
        />
        <button 
          onClick={handleSend}
          disabled={sendMessage.isLoading}
        >
          {sendMessage.isLoading ? 'Se trimite...' : 'Trimite'}
        </button>
      </div>
    </div>
  );
}
```

---

## 🎯 Advanced Patterns

### Optimistic Updates

Update UI immediately, rollback on error:

```javascript
export const useUpdateEvent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ eventId, data }) => {
      const docRef = doc(db, 'events', eventId);
      await updateDoc(docRef, data);
      return { eventId, data };
    },
    
    // Update UI immediately
    onMutate: async ({ eventId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(['events', eventId]);
      
      // Snapshot previous value
      const previousEvent = queryClient.getQueryData(['events', eventId]);
      
      // Optimistically update
      queryClient.setQueryData(['events', eventId], old => ({
        ...old,
        ...data,
      }));
      
      // Return context with previous value
      return { previousEvent };
    },
    
    // Rollback on error
    onError: (err, variables, context) => {
      queryClient.setQueryData(
        ['events', variables.eventId],
        context.previousEvent
      );
    },
    
    // Always refetch after error or success
    onSettled: (data) => {
      queryClient.invalidateQueries(['events', data.eventId]);
    },
  });
};
```

---

### Prefetching

Load data before user needs it:

```javascript
import { useQueryClient } from '@tanstack/react-query';

function EventsList() {
  const queryClient = useQueryClient();
  const { data: events } = useEvents();

  const handleMouseEnter = (eventId) => {
    // Prefetch event details on hover
    queryClient.prefetchQuery({
      queryKey: ['events', eventId],
      queryFn: () => fetchEvent(eventId),
    });
  };

  return (
    <div>
      {events?.map(event => (
        <div 
          key={event.id}
          onMouseEnter={() => handleMouseEnter(event.id)}
        >
          {event.title}
        </div>
      ))}
    </div>
  );
}
```

---

### Infinite Queries

Load more data as user scrolls:

```javascript
import { useInfiniteQuery } from '@tanstack/react-query';

export const useInfiniteEvents = () => {
  return useInfiniteQuery({
    queryKey: ['events', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const q = query(
        collection(db, 'events'),
        orderBy('date', 'desc'),
        limit(20),
        startAfter(pageParam)
      );
      const snapshot = await getDocs(q);
      return {
        events: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        nextCursor: snapshot.docs[snapshot.docs.length - 1],
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
};

// Usage
function EventsList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteEvents();

  return (
    <div>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.events.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ))}
      
      {hasNextPage && (
        <button 
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Se încarcă...' : 'Încarcă mai multe'}
        </button>
      )}
    </div>
  );
}
```

---

## 🔧 Configuration Tips

### Adjust Stale Time by Data Type

```javascript
// Frequently changing data (messages)
staleTime: 10 * 1000, // 10 seconds

// Moderately changing data (events)
staleTime: 5 * 60 * 1000, // 5 minutes

// Rarely changing data (user profile)
staleTime: 10 * 60 * 1000, // 10 minutes

// Static data (configuration)
staleTime: Infinity, // Never stale
```

---

### Enable/Disable Queries Conditionally

```javascript
const { data: profile } = useProfile(userId, {
  enabled: !!userId && isAuthenticated,
});
```

---

### Retry Logic

```javascript
const { data } = useQuery({
  queryKey: ['events'],
  queryFn: fetchEvents,
  retry: (failureCount, error) => {
    // Don't retry on 404
    if (error.status === 404) return false;
    
    // Retry up to 3 times
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => {
    // Exponential backoff
    return Math.min(1000 * 2 ** attemptIndex, 30000);
  },
});
```

---

## 📊 Monitoring & Debugging

### React Query DevTools

Already included in setup! Open with:
- Click the React Query icon in bottom-right corner
- View all queries and their states
- Manually trigger refetches
- Inspect cache data

### Log Cache Activity

```javascript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      onSuccess: (data) => {
        console.log('Query success:', data);
      },
      onError: (error) => {
        console.error('Query error:', error);
      },
    },
  },
});
```

---

## 🎯 Migration Checklist

### Phase 1: Setup (30 minutes)
- [ ] Install dependencies
- [ ] Create queryClient.js
- [ ] Wrap App with QueryClientProvider
- [ ] Add DevTools

### Phase 2: Create Hooks (1-2 hours)
- [ ] Create useEvents hook
- [ ] Create useProfile hook
- [ ] Create useWhatsApp hooks
- [ ] Test hooks in isolation

### Phase 3: Migrate Components (2-3 hours)
- [ ] Migrate EvenimenteScreen
- [ ] Migrate WhatsAppChatScreen
- [ ] Migrate AdminScreen
- [ ] Migrate other screens

### Phase 4: Test & Optimize (1 hour)
- [ ] Test all features
- [ ] Check DevTools for cache behavior
- [ ] Adjust staleTime values
- [ ] Monitor Firebase read reduction

---

## 🚀 Expected Results

### Before TanStack Query:
```
Page Load:
- 10-20 Firebase reads
- 2-4 seconds load time
- Loading spinners everywhere

Navigation:
- Refetch all data
- 1-2 seconds per navigation
- Poor UX

Daily Firebase Reads:
- 10,000-50,000 reads
- $5-20/month cost
```

### After TanStack Query:
```
Page Load:
- 2-5 Firebase reads (70% reduction)
- 0.5-1 second load time
- Instant UI with cached data

Navigation:
- Use cached data
- 0.1-0.3 seconds per navigation
- Excellent UX

Daily Firebase Reads:
- 3,000-15,000 reads (70% reduction)
- $1.50-6/month cost (70% savings)
```

---

## 📞 Next Steps

1. **Implement TanStack Query** (follow this guide)
2. **Test thoroughly** (use DevTools)
3. **Monitor Firebase usage** (should see 50-80% reduction)
4. **Consider IndexedDB** (for offline support)
5. **Upgrade Service Worker** (with Workbox)

Ready to implement? Let me know if you need help with any step!
