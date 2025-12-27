import type * as ElevenLabs from "../../api/index";
import * as core from "../../core";
import type * as serializers from "../index";
import { WorkspaceApiKeyResponseModelPermissionsItem } from "./WorkspaceApiKeyResponseModelPermissionsItem";
export declare const WorkspaceApiKeyResponseModel: core.serialization.ObjectSchema<serializers.WorkspaceApiKeyResponseModel.Raw, ElevenLabs.WorkspaceApiKeyResponseModel>;
export declare namespace WorkspaceApiKeyResponseModel {
    interface Raw {
        name: string;
        hint: string;
        key_id: string;
        service_account_user_id: string;
        created_at_unix?: number | null;
        is_disabled?: boolean | null;
        permissions?: WorkspaceApiKeyResponseModelPermissionsItem.Raw[] | null;
        character_limit?: number | null;
        character_count?: number | null;
    }
}
