import type * as ElevenLabs from "../../api/index";
import * as core from "../../core";
import type * as serializers from "../index";
import { WidgetTextContents } from "./WidgetTextContents";
export declare const WidgetLanguagePreset: core.serialization.ObjectSchema<serializers.WidgetLanguagePreset.Raw, ElevenLabs.WidgetLanguagePreset>;
export declare namespace WidgetLanguagePreset {
    interface Raw {
        text_contents?: WidgetTextContents.Raw | null;
    }
}
