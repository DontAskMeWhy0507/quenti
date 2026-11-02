import type { NonNullableUserContext } from "../../lib/types";
import type { TListDriveDecksSchema } from "./list-drive-decks.schema";
import { getGoogleAccessToken, listDriveApkgFiles } from "./google-drive";

type ListDriveDecksOptions = {
  ctx: NonNullableUserContext;
  input: TListDriveDecksSchema;
};

export const listDriveDecksHandler = async ({ ctx }: ListDriveDecksOptions) => {
  const token = await getGoogleAccessToken(ctx);
  const files = await listDriveApkgFiles(token);
  return { files };
};

export default listDriveDecksHandler;
