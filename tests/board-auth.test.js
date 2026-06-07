const assert = require("node:assert/strict");
const test = require("node:test");

const { handler } = require("../netlify/functions/board");

const originalEnv = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  BOARD_STORAGE: process.env.BOARD_STORAGE
};

test.after(() => {
  restoreEnv("ADMIN_TOKEN", originalEnv.ADMIN_TOKEN);
  restoreEnv("BOARD_STORAGE", originalEnv.BOARD_STORAGE);
});

const mutationCases = [
  {
    name: "board saves",
    event: {
      httpMethod: "PUT",
      body: JSON.stringify({ board: { items: [] } })
    }
  },
  {
    name: "site media saves",
    event: {
      httpMethod: "PUT",
      rawUrl: "https://runecraft.local/.netlify/functions/board?settings=1",
      body: JSON.stringify({ settings: { media: {} } })
    }
  },
  {
    name: "board migrations",
    event: {
      httpMethod: "PATCH",
      body: "{}"
    }
  },
  {
    name: "image uploads",
    event: {
      httpMethod: "POST",
      body: JSON.stringify({
        fileName: "sample.png",
        contentType: "image/png",
        data: "data:image/png;base64,aGVsbG8="
      })
    }
  }
];

test("admin mutations reject requests without the admin token", async (t) => {
  process.env.ADMIN_TOKEN = "correct-password";
  process.env.BOARD_STORAGE = "github";

  for (const { name, event } of mutationCases) {
    await t.test(name, async () => {
      const response = await handler(adminEvent(event));
      assert.equal(response.statusCode, 401);
      assert.deepEqual(JSON.parse(response.body), { error: "Invalid admin token" });
    });
  }
});

test("admin mutations reject requests with the wrong admin token", async (t) => {
  process.env.ADMIN_TOKEN = "correct-password";
  process.env.BOARD_STORAGE = "github";

  for (const { name, event } of mutationCases) {
    await t.test(name, async () => {
      const response = await handler(adminEvent(event, { Authorization: "Bearer wrong-password" }));
      assert.equal(response.statusCode, 401);
      assert.deepEqual(JSON.parse(response.body), { error: "Invalid admin token" });
    });
  }
});

function adminEvent(event, headers = {}) {
  return {
    headers,
    rawUrl: "https://runecraft.local/.netlify/functions/board",
    path: "/.netlify/functions/board",
    ...event
  };
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
