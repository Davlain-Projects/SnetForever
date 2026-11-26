// Firma de los bytes exactos del manifiesto (fase 5, tarea 14; la verifica verificarFirma de la app, tarea 5).
import { KeyObject, sign } from 'node:crypto';

/**
 * Firma `bytes` con Ed25519 y da el contenido del `.sig`: el base64 de los 64 bytes de la firma y un salto de línea.
 * Solo acepta una clave privada Ed25519 como KeyObject (la de cargarClavePrivada o una de prueba), nunca un PEM.
 * @param {Uint8Array} bytes
 * @param {import('node:crypto').KeyObject} clavePrivada
 * @returns {string}
 */
export function firmarBytes(bytes, clavePrivada) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('firmarBytes: los bytes tienen que ser un Buffer o un Uint8Array');
  if (!(clavePrivada instanceof KeyObject) || clavePrivada.type !== 'private' || clavePrivada.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('firmarBytes: la clave tiene que ser una clave privada Ed25519 (KeyObject)');
  }
  return `${sign(null, bytes, clavePrivada).toString('base64')}\n`;
}
