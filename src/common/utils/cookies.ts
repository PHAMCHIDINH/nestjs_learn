export const extractCookieValue = (
  cookieHeader: string | undefined,
  cookieName: string,
): string | null => {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const tokenCookie = cookies.find((part) =>
    part.startsWith(`${cookieName}=`),
  );

  if (!tokenCookie) {
    return null;
  }

  return decodeURIComponent(tokenCookie.split('=').slice(1).join('='));
};
