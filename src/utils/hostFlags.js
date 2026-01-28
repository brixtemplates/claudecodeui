export const isZaiHost = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname.toLowerCase();
  return host === 'zai.brixcoder.com' || host.startsWith('zai.');
};
