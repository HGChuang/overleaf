// LlmUsageRow.tsx
import React from 'react';
import ModelContextSettings, { ModelLimits } from './ModelContextSettings';

type Props = {
  name: string;
  chatModel: string; 
  codeModel: string;
  used: number;
  chatModels: string[];
  codeModels: string[];
  onChatModelChange: (newModel: string) => void;
  onCodeModelChange: (newModel: string) => void;
  onDelete: () => void;
  modelLimits?: { id: string; contextWindow?: number; maxTokens?: number };
  onLimitsSaved: (limits: ModelLimits) => void;
};

export default function LlmUsageRow({
  name,
  chatModel,
  codeModel,
  used,
  chatModels,
  codeModels,
  onChatModelChange,
  onCodeModelChange,
  onDelete,
  modelLimits,
  onLimitsSaved,
}: Props) {
  return (
    <tr>
      <td><span className="llm-name">{name}</span></td>
      {/* Chat model dropdown */}
      <td>
        <select
          value={chatModel}
          onChange={(e) => onChatModelChange(e.target.value)}
          className="llm-select"
        >
          {chatModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {modelLimits && <ModelContextSettings key={`${name}:${modelLimits.id}`} name={name} model={modelLimits} onSaved={onLimitsSaved} />}
      </td>
      {/* Code completion model dropdown */}
      <td>
        <select
          value={codeModel}
          onChange={(e) => onCodeModelChange(e.target.value)}
          className="llm-select"
        >
          {codeModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </td>
      <td><span className="llm-badge">{used}</span></td>
      <td>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          delete
        </button>
      </td>
    </tr>
  );
}
