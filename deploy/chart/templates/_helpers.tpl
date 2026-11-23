{{/*
Fully qualified resource name. Intentionally the chart name (not `<release>-<chart>`), so resources
land as `gchat-llm-usage` regardless of release name, and kubectl access stays predictable.
*/}}
{{- define "gchat-llm-usage.fullname" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "gchat-llm-usage.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/part-of: gchat-llm-usage
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels. They must stay stable across chart versions.
*/}}
{{- define "gchat-llm-usage.selectorLabels" -}}
app.kubernetes.io/name: gchat-llm-usage
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
