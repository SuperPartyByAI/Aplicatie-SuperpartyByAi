import type * as ElevenLabs from "../../api/index";
import * as core from "../../core";
import type * as serializers from "../index";
import { PhoneNumberTransferTransferDestination } from "./PhoneNumberTransferTransferDestination";
import { TransferTypeEnum } from "./TransferTypeEnum";
export declare const PhoneNumberTransfer: core.serialization.ObjectSchema<serializers.PhoneNumberTransfer.Raw, ElevenLabs.PhoneNumberTransfer>;
export declare namespace PhoneNumberTransfer {
    interface Raw {
        transfer_destination?: PhoneNumberTransferTransferDestination.Raw | null;
        phone_number?: string | null;
        condition: string;
        transfer_type?: TransferTypeEnum.Raw | null;
    }
}
