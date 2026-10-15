import { sendMagicLinkEmail } from "@quenti/emails";

export const sendVerificationRequest = async (params: {
  identifier: string;
  url: string;
}) => {
  console.log("\n=======================================================");
  console.log(`🔗 [LOCAL AUTH] Magic Login Link for ${params.identifier}:`);
  console.log(params.url);
  console.log("=======================================================\n");
  await sendMagicLinkEmail(params.identifier, params);
};
