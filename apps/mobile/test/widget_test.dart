import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:linkingchat_mobile/main.dart';

void main() {
  testWidgets('App renders skeleton screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: LinkingChatApp()));

    expect(find.text('LinkingChat Mobile'), findsOneWidget);
    expect(find.text('Sprint 0 — Flutter skeleton ready'), findsOneWidget);
  });
}
