export interface GenerateCodeResponse {
  code: string;
  partner: string;
  discount: number | null;
  expires_in_days: number;
  message: string;
}
