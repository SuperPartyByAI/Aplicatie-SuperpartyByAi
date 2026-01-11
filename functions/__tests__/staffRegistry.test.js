const { getStaffByCode, getStaffByUid } = require('../staffRegistry');

// Mock Firestore
const mockGet = jest.fn();
const mockWhere = jest.fn(() => ({ limit: jest.fn(() => ({ get: mockGet })) }));
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ where: mockWhere, doc: mockDoc }));

jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: mockCollection,
  }),
}));

describe('staffRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStaffByCode', () => {
    test('returns staff profile when code exists', async () => {
      mockGet.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'uid123',
            data: () => ({
              email: 'test@example.com',
              displayName: 'Test User',
              code: 'A13',
              role: 'staff',
              isActive: true,
            }),
          },
        ],
      });

      const result = await getStaffByCode('A13');

      expect(result).toEqual({
        uid: 'uid123',
        email: 'test@example.com',
        displayName: 'Test User',
        code: 'A13',
        role: 'staff',
        isActive: true,
      });
    });

    test('returns null when code does not exist', async () => {
      mockGet.mockResolvedValue({
        empty: true,
        docs: [],
      });

      const result = await getStaffByCode('INVALID');

      expect(result).toBeNull();
    });

    test('returns null for invalid input', async () => {
      const result = await getStaffByCode(null);
      expect(result).toBeNull();
    });
  });

  describe('getStaffByUid', () => {
    test('returns staff profile when uid exists', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'uid123',
        data: () => ({
          email: 'test@example.com',
          displayName: 'Test User',
          code: 'A13',
          role: 'staff',
          isActive: true,
        }),
      });

      const result = await getStaffByUid('uid123');

      expect(result).toEqual({
        uid: 'uid123',
        email: 'test@example.com',
        displayName: 'Test User',
        code: 'A13',
        role: 'staff',
        isActive: true,
      });
    });

    test('returns null when uid does not exist', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      const result = await getStaffByUid('invalid');

      expect(result).toBeNull();
    });
  });
});
