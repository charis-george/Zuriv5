function slugifyStorefrontName(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'storefront';
}

function newProfileId() {
  return `sf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function defaultStorefrontDetails(businessName) {
  return {
    name: String(businessName || '').trim() || 'Your store',
    tagline: '',
    cuisineTags: []
  };
}

function createDefaultStorefrontProfile(name, opts = {}) {
  const label = String(name || 'Main storefront').trim() || 'Main storefront';
  const slug = opts.slug || slugifyStorefrontName(label);
  return {
    id: opts.id || newProfileId(),
    slug,
    name: label,
    isDefault: opts.isDefault !== false,
    catalogPresetId: opts.catalogPresetId || null,
    config: opts.config && typeof opts.config === 'object' ? opts.config : {},
    details:
      opts.details && typeof opts.details === 'object'
        ? opts.details
        : defaultStorefrontDetails(label)
  };
}

function normalizeProfile(raw, fallbackName) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || fallbackName || 'Storefront').trim() || 'Storefront';
  const slug = String(raw.slug || slugifyStorefrontName(name)).trim() || slugifyStorefrontName(name);
  return {
    id: String(raw.id || newProfileId()),
    slug,
    name,
    isDefault: raw.isDefault === true,
    catalogPresetId: raw.catalogPresetId || raw.catalog_preset_id || null,
    config: raw.config && typeof raw.config === 'object' ? raw.config : {},
    details:
      raw.details && typeof raw.details === 'object'
        ? {
            name: String(raw.details.name || name).trim() || name,
            tagline: String(raw.details.tagline || '').trim(),
            cuisineTags: Array.isArray(raw.details.cuisineTags) ? raw.details.cuisineTags : [],
            contactPhone: raw.details.contactPhone,
            instagramHandle: raw.details.instagramHandle,
            whatsappNumber: raw.details.whatsappNumber,
            eventPages: Array.isArray(raw.details.eventPages) ? raw.details.eventPages : [],
            menuTranslations: raw.details.menuTranslations
          }
        : defaultStorefrontDetails(name)
  };
}

function dedupeProfileSlugs(profiles) {
  const seen = new Set();
  return profiles.map((profile, index) => {
    let slug = profile.slug;
    let suffix = 2;
    while (seen.has(slug)) {
      slug = `${profile.slug}-${suffix}`;
      suffix += 1;
    }
    seen.add(slug);
    return {
      ...profile,
      slug,
      isDefault: profile.isDefault || (index === 0 && !profiles.some((p) => p.isDefault))
    };
  });
}

function normalizeStorefrontProfiles(row) {
  const businessName = row?.name || row?.business_name || '';
  const rawProfiles = row?.storefront_profiles ?? row?.storefrontProfiles;
  if (Array.isArray(rawProfiles) && rawProfiles.length > 0) {
    const profiles = rawProfiles
      .map((p) => normalizeProfile(p, businessName))
      .filter(Boolean);
    if (profiles.length > 0) {
      if (!profiles.some((p) => p.isDefault)) profiles[0].isDefault = true;
      return dedupeProfileSlugs(profiles);
    }
  }

  const legacyDetails =
    row?.storefront_details && typeof row.storefront_details === 'object'
      ? row.storefront_details
      : row?.storefrontDetails && typeof row.storefrontDetails === 'object'
        ? row.storefrontDetails
        : defaultStorefrontDetails(businessName);
  const legacyConfig =
    row?.storefront_config && typeof row.storefront_config === 'object'
      ? row.storefront_config
      : row?.storefrontConfig && typeof row.storefrontConfig === 'object'
        ? row.storefrontConfig
        : {};

  return [
    createDefaultStorefrontProfile(
      String(legacyDetails.name || businessName || 'Main storefront').trim() || 'Main storefront',
      {
        id: 'sf_default',
        slug: 'main',
        isDefault: true,
        config: legacyConfig,
        details: legacyDetails
      }
    )
  ];
}

function getDefaultProfile(profiles) {
  if (!Array.isArray(profiles) || !profiles.length) return null;
  return profiles.find((p) => p.isDefault) || profiles[0];
}

function findProfileBySlugOrId(profiles, slugOrId) {
  if (!Array.isArray(profiles) || !slugOrId) return null;
  const norm = String(slugOrId).trim().toLowerCase();
  return (
    profiles.find((p) => p.id === slugOrId) ||
    profiles.find((p) => String(p.slug || '').trim().toLowerCase() === norm) ||
    null
  );
}

function findProfileForEvent(profiles, eventSlug) {
  if (!Array.isArray(profiles) || !eventSlug) return null;
  const norm = String(eventSlug).trim().toLowerCase();
  for (const profile of profiles) {
    const pages = Array.isArray(profile.details?.eventPages) ? profile.details.eventPages : [];
    const event = pages.find(
      (p) => p && p.enabled !== false && String(p.slug || '').trim().toLowerCase() === norm
    );
    if (event) return { profile, event };
  }
  return null;
}

function findEventPageInProfiles(profiles, eventSlug) {
  const hit = findProfileForEvent(profiles, eventSlug);
  return hit?.event || null;
}

function legacyColumnsFromProfiles(profiles) {
  const def = getDefaultProfile(profiles);
  return {
    storefront_config: def?.config || {},
    storefront_details: def?.details || defaultStorefrontDetails('')
  };
}

function updateProfileInList(profiles, profileId, patch) {
  return profiles.map((p) => (p.id === profileId ? { ...p, ...patch } : p));
}

module.exports = {
  slugifyStorefrontName,
  newProfileId,
  createDefaultStorefrontProfile,
  normalizeStorefrontProfiles,
  getDefaultProfile,
  findProfileBySlugOrId,
  findProfileForEvent,
  findEventPageInProfiles,
  legacyColumnsFromProfiles,
  updateProfileInList,
  dedupeProfileSlugs
};
