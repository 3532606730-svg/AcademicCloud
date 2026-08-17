export function validateLoginName(value: string): string {
  if (value.length < 1 || value.length > 254 || value !== value.trim() || /\s/.test(value)) {
    throw new Error("login name must be 1-254 non-whitespace characters without surrounding space");
  }
  return value;
}

export function validatePassword(password: string): string {
  if (password.length < 12 || password.length > 1_024) {
    throw new Error("password must be 12-1024 characters");
  }
  return password;
}
