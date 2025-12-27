import type * as ElevenLabs from "../../api/index";
import * as core from "../../core";
import type * as serializers from "../index";
export declare const ZendeskConversationInitiationTrigger: core.serialization.ObjectSchema<serializers.ZendeskConversationInitiationTrigger.Raw, ElevenLabs.ZendeskConversationInitiationTrigger>;
export declare namespace ZendeskConversationInitiationTrigger {
    interface Raw {
        ticket_id: number;
    }
}
