import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const RESOURCE_SELECT =
  "id, owner_id, resource_type, title, url, storage_bucket, storage_path, file_name, mime_type, size_bytes, created_at";

export function isMissingLessonResourceSchema(error) {
  const message = String(error?.message || "");
  return [
    "lesson_resources",
    "lesson_resource_lessons",
    "lesson_resource_shares",
    "teacher_resource_library_shares",
    "lesson_resource_site_names",
  ].some((table) => message.includes(table));
}

export async function listConnectedTeachers(userId, admin = createAdminClient()) {
  const { data: connections, error } = await admin
    .from("teacher_connections")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw new Error(error.message);

  const ids = [
    ...new Set(
      (connections || []).map((row) =>
        row.requester_id === userId ? row.addressee_id : row.requester_id
      )
    ),
  ];
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, display_name, school_name")
    .in("id", ids)
    .order("display_name", { ascending: true });

  if (profilesError) throw new Error(profilesError.message);
  return profiles || [];
}

export async function loadLessonResourcePlanningData({ userId, lessonIds }) {
  const admin = createAdminClient();
  const uniqueLessonIds = [...new Set((lessonIds || []).filter(Boolean))];
  const connectedTeachers = await listConnectedTeachers(userId, admin);

  const { data: siteNameRows, error: siteNamesError } = await admin
    .from("lesson_resource_site_names")
    .select("hostname, display_name")
    .eq("owner_id", userId);
  if (siteNamesError && !isMissingLessonResourceSchema(siteNamesError)) {
    throw new Error(siteNamesError.message);
  }
  const siteNames = siteNamesError
    ? {}
    : Object.fromEntries((siteNameRows || []).map((row) => [row.hostname, row.display_name]));

  const { data: libraryShares, error: librarySharesError } = await admin
    .from("teacher_resource_library_shares")
    .select("owner_id, teacher_id")
    .or(`owner_id.eq.${userId},teacher_id.eq.${userId}`);

  if (librarySharesError) {
    if (isMissingLessonResourceSchema(librarySharesError)) {
      return {
        available: false,
        connectedTeachers,
        siteNames,
        librarySharedWith: [],
        ownResources: [],
        sharedResources: [],
      };
    }
    throw new Error(librarySharesError.message);
  }

  const librarySharedWith = (libraryShares || [])
    .filter((share) => share.owner_id === userId)
    .map((share) => share.teacher_id);

  if (uniqueLessonIds.length === 0) {
    return {
      available: true,
      connectedTeachers,
      siteNames,
      librarySharedWith,
      ownResources: [],
      sharedResources: [],
    };
  }

  const { data: associations, error: associationError } = await admin
    .from("lesson_resource_lessons")
    .select("resource_id, lesson_id")
    .in("lesson_id", uniqueLessonIds);

  if (associationError) {
    if (isMissingLessonResourceSchema(associationError)) {
      return {
        available: false,
        connectedTeachers,
        siteNames,
        librarySharedWith,
        ownResources: [],
        sharedResources: [],
      };
    }
    throw new Error(associationError.message);
  }

  const resourceIds = [...new Set((associations || []).map((row) => row.resource_id))];
  if (resourceIds.length === 0) {
    return {
      available: true,
      connectedTeachers,
      siteNames,
      librarySharedWith,
      ownResources: [],
      sharedResources: [],
    };
  }

  const [{ data: resources, error: resourcesError }, { data: directShares, error: sharesError }] =
    await Promise.all([
      admin.from("lesson_resources").select(RESOURCE_SELECT).in("id", resourceIds),
      admin.from("lesson_resource_shares").select("resource_id, teacher_id").in("resource_id", resourceIds),
    ]);

  if (resourcesError) throw new Error(resourcesError.message);
  if (sharesError) throw new Error(sharesError.message);

  const connectedTeacherIds = new Set(connectedTeachers.map((teacher) => teacher.id));
  const globallySharedOwnerIds = new Set(
    (libraryShares || [])
      .filter((share) => share.teacher_id === userId && connectedTeacherIds.has(share.owner_id))
      .map((share) => share.owner_id)
  );
  const directSharesForUser = new Set(
    (directShares || [])
      .filter((share) => share.teacher_id === userId)
      .map((share) => share.resource_id)
  );
  const lessonIdsByResource = new Map();
  for (const association of associations || []) {
    const ids = lessonIdsByResource.get(association.resource_id) || [];
    ids.push(association.lesson_id);
    lessonIdsByResource.set(association.resource_id, ids);
  }
  const sharedTeacherIdsByResource = new Map();
  for (const share of directShares || []) {
    const ids = sharedTeacherIdsByResource.get(share.resource_id) || [];
    ids.push(share.teacher_id);
    sharedTeacherIdsByResource.set(share.resource_id, ids);
  }

  const visibleOwnerIds = [
    ...new Set(
      (resources || [])
        .filter((resource) => resource.owner_id !== userId)
        .filter(
          (resource) =>
            connectedTeacherIds.has(resource.owner_id) &&
            (globallySharedOwnerIds.has(resource.owner_id) || directSharesForUser.has(resource.id))
        )
        .map((resource) => resource.owner_id)
    ),
  ];
  const ownerProfiles = visibleOwnerIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", visibleOwnerIds)
    : { data: [], error: null };
  if (ownerProfiles.error) throw new Error(ownerProfiles.error.message);
  const ownerNameById = new Map((ownerProfiles.data || []).map((profile) => [profile.id, profile.display_name]));

  const withAssociations = (resource) => ({
    ...resource,
    lessonIds: lessonIdsByResource.get(resource.id) || [],
    sharedWith: sharedTeacherIdsByResource.get(resource.id) || [],
  });
  const ownResources = (resources || [])
    .filter((resource) => resource.owner_id === userId)
    .map(withAssociations);
  const sharedResources = (resources || [])
    .filter((resource) => resource.owner_id !== userId)
    .filter(
      (resource) =>
        connectedTeacherIds.has(resource.owner_id) &&
        (globallySharedOwnerIds.has(resource.owner_id) || directSharesForUser.has(resource.id))
    )
    .map((resource) => ({
      ...withAssociations(resource),
      ownerName: ownerNameById.get(resource.owner_id) || "Connected teacher",
      sharedThroughLibrary: globallySharedOwnerIds.has(resource.owner_id),
    }));

  return {
    available: true,
    connectedTeachers,
    siteNames,
    librarySharedWith,
    ownResources,
    sharedResources,
  };
}

export async function canUserOpenLessonResource({ userId, resource, admin = createAdminClient() }) {
  if (!resource) return false;
  if (resource.owner_id === userId) return true;

  const connectedTeachers = await listConnectedTeachers(userId, admin);
  if (!connectedTeachers.some((teacher) => teacher.id === resource.owner_id)) return false;

  const [{ data: directShare }, { data: libraryShare }] = await Promise.all([
    admin
      .from("lesson_resource_shares")
      .select("resource_id")
      .eq("resource_id", resource.id)
      .eq("teacher_id", userId)
      .maybeSingle(),
    admin
      .from("teacher_resource_library_shares")
      .select("owner_id")
      .eq("owner_id", resource.owner_id)
      .eq("teacher_id", userId)
      .maybeSingle(),
  ]);

  return Boolean(directShare || libraryShare);
}
