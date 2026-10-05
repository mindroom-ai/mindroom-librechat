/**
 * Pins an agent's provider options to its validated model. `model_parameters` is free-form, and
 * OpenAI-compatible clients send `modelKwargs` verbatim in the request body, where a nested
 * `model` would replace the model that `validateAgentModel` checked against the user's allowed
 * models.
 */
export function pinAgentModel<T extends Record<string, unknown>, M>(
  modelOptions: T,
  model: M,
): T & { model: M } {
  const { modelKwargs } = modelOptions;
  if (modelKwargs == null || typeof modelKwargs !== 'object' || Array.isArray(modelKwargs)) {
    return { ...modelOptions, model };
  }
  const { model: _nestedModel, ...forwardedKwargs } = modelKwargs as Record<string, unknown>;
  return { ...modelOptions, model, modelKwargs: forwardedKwargs };
}
