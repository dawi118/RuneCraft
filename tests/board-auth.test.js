const assert = require("node:assert/strict");
const test = require("node:test");

const { handler, _private } = require("../netlify/functions/board");

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

test("board saves merge stale browser drafts without removing live tickets", () => {
  const baseBoard = boardFixture(["lumbridge", "varrock"]);
  const localBoard = boardFixture(["lumbridge", "varrock", "falador"]);
  const liveBoard = boardFixture(["lumbridge", "varrock", "draynor"]);

  const { board } = _private.mergeBoardChanges(localBoard, baseBoard, liveBoard);

  assert.deepEqual(ticketIds(board), ["falador", "lumbridge", "varrock", "draynor"]);
});

test("board saves keep explicit local edits and deletes", () => {
  const baseBoard = boardFixture(["lumbridge", "varrock"]);
  const localBoard = boardFixture(["lumbridge"], {
    lumbridge: { progress: 55, what: "Locally edited." }
  });
  const liveBoard = boardFixture(["lumbridge", "varrock", "draynor"], {
    lumbridge: { progress: 15, what: "Live edit." }
  });

  const { board } = _private.mergeBoardChanges(localBoard, baseBoard, liveBoard);
  const lumbridge = board.items.find((item) => item.id === "lumbridge");

  assert.deepEqual(ticketIds(board), ["lumbridge", "draynor"]);
  assert.equal(lumbridge.progress, 55);
  assert.equal(lumbridge.what, "Locally edited.");
});

test("board saves without a base snapshot upsert local tickets without deleting live tickets", () => {
  const localBoard = boardFixture(["lumbridge", "falador"], {
    lumbridge: { progress: 95, what: "Old local draft." }
  });
  const liveBoard = boardFixture(["lumbridge", "draynor"], {
    lumbridge: { progress: 20, what: "Current live version." }
  });

  const { board } = _private.mergeBoardChanges(localBoard, null, liveBoard);
  const lumbridge = board.items.find((item) => item.id === "lumbridge");

  assert.deepEqual(ticketIds(board), ["falador", "lumbridge", "draynor"]);
  assert.equal(lumbridge.progress, 95);
  assert.equal(lumbridge.what, "Old local draft.");
});

test("board saves with explicit ticket changes keep unrelated live tickets", () => {
  const baseBoard = boardFixture(["lumbridge", "varrock"]);
  const localBoard = boardFixture(["lumbridge", "varrock"], {
    lumbridge: { progress: 5, what: "Stale local copy." },
    varrock: { progress: 70, what: "Explicitly edited locally." }
  });
  const liveBoard = boardFixture(["lumbridge", "varrock", "draynor"], {
    lumbridge: { progress: 40, what: "Current live copy." },
    varrock: { progress: 10, what: "Old live copy." }
  });

  const { board } = _private.mergeBoardChanges(localBoard, baseBoard, liveBoard, {
    modifiedTicketIds: ["varrock"]
  });
  const lumbridge = board.items.find((item) => item.id === "lumbridge");
  const varrock = board.items.find((item) => item.id === "varrock");

  assert.deepEqual(ticketIds(board), ["lumbridge", "varrock", "draynor"]);
  assert.equal(lumbridge.progress, 40);
  assert.equal(lumbridge.what, "Current live copy.");
  assert.equal(varrock.progress, 70);
  assert.equal(varrock.what, "Explicitly edited locally.");
});

test("board saves with explicit ticket deletes remove only deleted tickets", () => {
  const baseBoard = boardFixture(["lumbridge", "varrock"]);
  const localBoard = boardFixture(["lumbridge"], {
    lumbridge: { progress: 5, what: "Stale local copy." }
  });
  const liveBoard = boardFixture(["lumbridge", "varrock", "draynor"], {
    lumbridge: { progress: 40, what: "Current live copy." }
  });

  const { board } = _private.mergeBoardChanges(localBoard, baseBoard, liveBoard, {
    deletedTicketIds: ["varrock"]
  });
  const lumbridge = board.items.find((item) => item.id === "lumbridge");

  assert.deepEqual(ticketIds(board), ["lumbridge", "draynor"]);
  assert.equal(lumbridge.progress, 40);
  assert.equal(lumbridge.what, "Current live copy.");
});

function adminEvent(event, headers = {}) {
  return {
    headers,
    rawUrl: "https://runecraft.local/.netlify/functions/board",
    path: "/.netlify/functions/board",
    ...event
  };
}

function boardFixture(ids, overrides = {}) {
  return {
    items: ids.map((id) => ({
      id,
      name: titleFromId(id),
      location: "backlog",
      region: "General",
      category: "other",
      progress: 0,
      featured: false,
      completedAt: "",
      estimatedTotalTime: "",
      what: `${titleFromId(id)} build.`,
      images: [],
      ...overrides[id]
    }))
  };
}

function ticketIds(board) {
  return board.items.map((item) => item.id);
}

function titleFromId(id) {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
