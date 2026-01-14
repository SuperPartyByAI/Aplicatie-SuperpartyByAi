const { makeRequireSuperAdminExpress } = require('../httpSuperAdminGuard');

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
  };
  return res;
}

test('rejects missing token', async () => {
  const mw = makeRequireSuperAdminExpress({
    verifyIdToken: async () => ({ email: 'ursache.andrei1995@gmail.com' }),
  });
  const req = { headers: {}, query: {} };
  const res = makeRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(false);
  expect(res.statusCode).toBe(401);
});

test('rejects non-superadmin token', async () => {
  const mw = makeRequireSuperAdminExpress({
    verifyIdToken: async () => ({ email: 'x@example.com' }),
  });
  const req = { headers: { authorization: 'Bearer t' }, query: {} };
  const res = makeRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(false);
  expect(res.statusCode).toBe(403);
});

test('allows superadmin token', async () => {
  const mw = makeRequireSuperAdminExpress({
    verifyIdToken: async () => ({ email: 'ursache.andrei1995@gmail.com' }),
  });
  const req = { headers: { authorization: 'Bearer t' }, query: {} };
  const res = makeRes();
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(true);
  expect(res.statusCode).toBe(200);
});

