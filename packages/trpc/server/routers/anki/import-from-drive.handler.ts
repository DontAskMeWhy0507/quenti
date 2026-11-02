import type { NonNullableUserContext } from "../../lib/types";
import type { TImportFromDriveSchema } from "./import-from-drive.schema";
import { downloadDriveFile, getGoogleAccessToken } from "./google-drive";
import { importPackageHandler } from "./import-package.handler";

type ImportFromDriveOptions = {
  ctx: NonNullableUserContext;
  input: TImportFromDriveSchema;
};

export const importFromDriveHandler = async ({
  ctx,
  input,
}: ImportFromDriveOptions) => {
  const token = await getGoogleAccessToken(ctx);
  const buffer = await downloadDriveFile(token, input.fileId);
  return importPackageHandler({
    ctx,
    input: {
      fileBase64: buffer.toString("base64"),
      fileName: input.fileName,
    },
  });
};

export default importFromDriveHandler;
