import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state_provider.dart';

class GridOverlay extends StatelessWidget {
  const GridOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateProvider>(
      builder: (context, appState, child) {
        if (!appState.isGridOpen) return const SizedBox.shrink();

        return GestureDetector(
          onTap: () => appState.closeGrid(),
          child: AnimatedOpacity(
            opacity: appState.isGridOpen ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 300),
            child: Container(
              color: Colors.black.withOpacity(0.7),
              child: SafeArea(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Align(
                        alignment: Alignment.topRight,
                        child: IconButton(
                          icon: const Icon(Icons.close, color: Colors.white, size: 32),
                          onPressed: () => appState.closeGrid(),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () {}, // Prevent closing when tapping on grid
                        child: GridView.count(
                          crossAxisCount: 2,
                          padding: const EdgeInsets.all(24),
                          mainAxisSpacing: 20,
                          crossAxisSpacing: 20,
                          childAspectRatio: 1.0,
                          children: [
                            ..._buildNormalButtons(context, appState),
                            if (appState.isAdminMode) ..._buildAdminButtons(context, appState),
                            if (appState.isGmMode) ..._buildGmButtons(context, appState),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  List<Widget> _buildNormalButtons(BuildContext context, AppStateProvider appState) {
    return [
      _buildCard(context, appState, 'Evenimente', Icons.event, '/evenimente', const Color(0xFF4ECDC4)),
      _buildCard(context, appState, 'Disponibilitate', Icons.calendar_today, '/disponibilitate', const Color(0xFF4ECDC4)),
      _buildCard(context, appState, 'Salarii', Icons.attach_money, '/salarizare', const Color(0xFF4ECDC4)),
      _buildCard(context, appState, 'Centrala', Icons.phone, '/centrala', const Color(0xFF4ECDC4)),
      _buildCard(context, appState, 'WhatsApp', Icons.chat, '/whatsapp', const Color(0xFF4ECDC4)),
      _buildCard(context, appState, 'Echipă', Icons.people, '/team', const Color(0xFF4ECDC4)),
    ];
  }

  List<Widget> _buildAdminButtons(BuildContext context, AppStateProvider appState) {
    return [
      _buildCard(context, appState, 'Aprobări KYC', Icons.check_circle, '/admin/kyc', const Color(0xFFEF4444)),
      _buildCard(context, appState, 'Conversații AI', Icons.chat_bubble, '/admin/ai-conversations', const Color(0xFFEF4444)),
      _buildActionCard(context, appState, 'Ieși Admin', Icons.exit_to_app, const Color(0xFFEF4444), () {
        appState.exitAdminMode();
        appState.closeGrid();
      }),
    ];
  }

  List<Widget> _buildGmButtons(BuildContext context, AppStateProvider appState) {
    return [
      _buildCard(context, appState, 'Conturi WA', Icons.settings, '/gm/accounts', const Color(0xFFFBBF24)),
      _buildCard(context, appState, 'Metrice', Icons.bar_chart, '/gm/metrics', const Color(0xFFFBBF24)),
      _buildCard(context, appState, 'Analiză', Icons.analytics, '/gm/analytics', const Color(0xFFFBBF24)),
      _buildCard(context, appState, 'Setări Staff', Icons.people_outline, '/gm/staff-setup', const Color(0xFFFBBF24)),
      _buildActionCard(context, appState, 'Ieși GM', Icons.exit_to_app, const Color(0xFFFBBF24), () {
        appState.exitGmMode();
        appState.closeGrid();
      }),
    ];
  }

  Widget _buildCard(BuildContext context, AppStateProvider appState, String title, IconData icon, String route, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            appState.closeGrid();
            Navigator.pushNamed(context, route);
          },
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(icon, size: 40, color: color),
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF2D3748),
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActionCard(BuildContext context, AppStateProvider appState, String title, IconData icon, Color color, VoidCallback onTap) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(icon, size: 40, color: color),
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF2D3748),
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
