// Clave pública Ed25519 (PEM SPKI) con la que se verifica la firma del manifiesto de las actualizaciones (R7).
// La puso la tarea 18 con `npm run firma:crear` (11-nov-2026); la privada vive en ~/.snetforever-firma (DPAPI).
// Con null no habría actualizaciones (no se abriría ninguna conexión).
export const CLAVE_PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApZ1mBD7gmJU+XqBMtN3J+oDwyzMRWEFi6b3NQe0lkRo=
-----END PUBLIC KEY-----
`;
