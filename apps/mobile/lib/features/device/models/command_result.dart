class CommandResult {
  final String commandId;
  final String status;
  final String? output;
  final int? exitCode;
  final String? errorMessage;
  final int executionTimeMs;

  CommandResult({
    required this.commandId,
    required this.status,
    this.output,
    this.exitCode,
    this.errorMessage,
    required this.executionTimeMs,
  });

  bool get isSuccess => status == 'success';
  bool get isError => status == 'error';

  factory CommandResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>?;
    final error = json['error'] as Map<String, dynamic>?;

    return CommandResult(
      commandId: json['commandId'] as String,
      status: json['status'] as String,
      output: data?['output'] as String?,
      exitCode: data?['exitCode'] as int?,
      errorMessage: error?['message'] as String?,
      executionTimeMs: json['executionTimeMs'] as int,
    );
  }
}
