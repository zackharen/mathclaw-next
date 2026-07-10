import test from "node:test";
import assert from "node:assert/strict";

import {
  getAccountTypeForUser,
  normalizeAccountType,
  sanitizeNextForAccountType,
} from "../lib/auth/account-type.js";

function fakeSupabase({ profileType = null, joinedMembership = null, ownedCourse = null } = {}) {
  return {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          if (table === "profiles") {
            return Promise.resolve({ data: profileType ? { account_type: profileType } : null, error: null });
          }
          if (table === "student_course_memberships") {
            return Promise.resolve({ data: joinedMembership ? { id: joinedMembership } : null, error: null });
          }
          if (table === "courses") {
            return Promise.resolve({ data: ownedCourse ? { id: ownedCourse } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

test("unknown account types default to student", () => {
  assert.equal(normalizeAccountType(), "student");
  assert.equal(normalizeAccountType(""), "student");
  assert.equal(normalizeAccountType("teacher"), "teacher");
});

test("missing account type resolves to student when no teacher evidence exists", async () => {
  const accountType = await getAccountTypeForUser(
    fakeSupabase(),
    { id: "user-1", user_metadata: {} }
  );

  assert.equal(accountType, "student");
});

test("owned courses still infer teacher for legacy accounts", async () => {
  const accountType = await getAccountTypeForUser(
    fakeSupabase({ ownedCourse: "course-1" }),
    { id: "user-1", user_metadata: {} }
  );

  assert.equal(accountType, "teacher");
});

test("student fallback keeps teacher-only redirects out of student accounts", () => {
  assert.equal(sanitizeNextForAccountType("/classes", null), "/play");
});
