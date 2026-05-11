import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { persistGoogleCredentialsForTeacher } from "@/src/server/auth/persistTeacherGoogle";

const googleClientId =
  process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret =
  process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    /** Teachers: Drive scope + refresh token for uploads. */
    GoogleProvider({
      id: "google",
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive.file",
          ].join(" "),
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!profile?.email) {
        return true;
      }
      try {
        await persistGoogleCredentialsForTeacher(
          profile.email,
          typeof profile.name === "string" ? profile.name : null,
          account?.refresh_token ?? null
        );
      } catch (e) {
        console.error("persistGoogleCredentialsForTeacher", e);
        return false;
      }
      return true;
    },
  },
};
