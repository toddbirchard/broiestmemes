/**
 * The modal slot renders nothing unless an image route is intercepted into it.
 * Required: without a default, a hard navigation to /[category] 404s the slot.
 */
export default function ModalDefault() {
  return null;
}
