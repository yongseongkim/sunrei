{{- define "sunrei.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sunrei.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "sunrei.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sunrei.labels" -}}
helm.sh/chart: {{ include "sunrei.chart" . }}
{{ include "sunrei.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "sunrei.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sunrei.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "sunrei.componentLabels" -}}
{{ include "sunrei.labels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "sunrei.componentSelectorLabels" -}}
{{ include "sunrei.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
