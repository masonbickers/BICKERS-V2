const compact = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const VEHICLE_TEMPLATE_ALIASES = [
  ["silverado", "silverado"],
  ["cheyenne", "cheyenne"],
  ["mini cooper", "mini cooper"],
  ["mini", "mini cooper"],
  ["pulse", "pulse"],
  ["audi rs4", "audi rs4"],
  ["audi", "audi rs4"],
  ["rs4", "audi rs4"],
  ["dodge ram", "dodge ram"],
  ["dodge", "dodge ram"],
  ["ram", "dodge ram"],
  ["explorer", "explorer"],
  ["glc", "glc"],
  ["gmc sierra", "gmc sierra"],
  ["gmc", "gmc"],
  ["sierra", "sierra"],
  ["land rover discovery", "land rover"],
  ["land rover", "land rover"],
  ["discovery", "discovery"],
  ["lightning f150", "lightning f150"],
  ["lightning", "lightning f150"],
  ["f150", "lightning f150"],
  ["raptor", "raptor"],
  ["sprinter no 1", "sprinter no 1"],
  ["sprinter no 2", "sprinter no 2"],
  ["sprinter", "sprinter"],
  ["tiger", "tiger"],
  ["horse rig", "horse"],
  ["horse", "horse"],
  ["low loader no 1", "low loader no 1"],
  ["low loader no 2", "low loader no 2"],
  ["low loader", "low loader"],
  ["pod car build", "pod car build"],
  ["pod car", "pod car"],
  ["top driver", "top driver"],
  ["trojan electric", "trojan electric"],
  ["petrol powered trojan", "petrol powered trojan"],
  ["trojan", "trojan"],
  ["twizzy", "twizzy"],
  ["atlas e bike", "atlas e bike"],
  ["bandit", "bandit"],
  ["can am maverick", "can am"],
  ["can am", "can am"],
  ["maverick", "maverick"],
  ["dominator", "dominator"],
  ["electric mountain bike", "electric bicycle"],
  ["electric bicycle", "electric bicycle"],
  ["e bike", "e bike"],
  ["enduromax", "enduromax"],
  ["e trike", "e trike"],
  ["tricycle", "tricycle"],
  ["panther", "panther"],
  ["racing quad", "racing quad"],
  ["rubicon", "rubicon"],
  ["quad", "quad"],
  ["motorcycle", "motorcycle"],
  ["bicycle banking", "bicycle banking"],
  ["motorcycle banking", "motorcycle banking"],
  ["mini low loader", "mini low loader"],
];

const aliasSpecificity = (alias) => {
  const words = compact(alias).split(" ").filter(Boolean).length;
  return words * 100 + compact(alias).length;
};

export function findSuggestedQuoteTemplateForVehicles(vehicleLabels = [], templates = []) {
  const assignedVehicles = vehicleLabels.map(compact).filter(Boolean);
  if (!assignedVehicles.length || !Array.isArray(templates) || !templates.length) return null;

  let bestMatch = null;

  VEHICLE_TEMPLATE_ALIASES.forEach(([vehicleAlias, templateAlias]) => {
    const normalizedVehicleAlias = compact(vehicleAlias);
    if (!assignedVehicles.some((vehicle) => vehicle.includes(normalizedVehicleAlias))) return;

    const normalizedTemplateAlias = compact(templateAlias);
    const template = templates.find((candidate) =>
      compact(`${candidate?.file || ""} ${candidate?.serviceDescription || ""}`).includes(normalizedTemplateAlias)
    );
    if (!template) return;

    const score = aliasSpecificity(normalizedVehicleAlias);
    if (!bestMatch || score > bestMatch.score) bestMatch = { template, score };
  });

  return bestMatch?.template || null;
}
