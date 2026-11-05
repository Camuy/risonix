// Base URL dell'API di import/consultazione (P1-07).
// In sviluppo punta al servizio mri-api; in produzione è same-origin via Nginx.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
