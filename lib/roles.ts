// Keep stored identifiers stable so existing accounts retain their permissions.
export const roleLabels = {
  ADMIN: "Dueño",
  SELLER: "Administrador",
} as const;

export const ownerOnlySections = ["products", "financing", "profits", "receipts", "users"] as const;
export function canAccessSection(role: keyof typeof roleLabels, section: string) {
  return role === "ADMIN" || !ownerOnlySections.some(value => value === section);
}
